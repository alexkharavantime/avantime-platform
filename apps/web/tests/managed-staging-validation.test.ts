import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeDependencyAudit,
  validateDependencyRiskAcceptance,
  type NpmAuditReport,
} from '../lib/governance-dependency-report';
import {
  createGovernanceEvidenceEnvelope,
  governanceEvidenceHash,
  verifyGovernanceEvidenceEnvelope,
  type GovernanceEvidence,
} from '../lib/governance-evidence';
import {
  pollGovernanceCondition,
  validateGovernanceInvalidationObservation,
} from '../lib/governance-invalidation-validation';
import {
  REQUIRED_GOVERNANCE_NOTIFICATION_EVENTS,
  sanitizeNotificationProviderRecord,
  validateGovernanceNotificationBundle,
  validateGovernanceNotificationSet,
  type GovernanceNotificationReceipt,
} from '../lib/governance-notification-validation';
import {
  createGovernanceSignOffEnvelope,
  verifyGovernanceSignOffEnvelope,
  type GovernanceSignOff,
} from '../lib/governance-signoff';
import {
  MANAGED_STAGING_CONFIRMATION,
  runManagedStagingPreflight,
  validateLastOwnerRecoveryDrill,
  validateManagedCeremonyManifest,
  validateManagedStagingBoundary,
  type ManagedPreflightProbeName,
} from '../lib/managed-staging-validation';

const now = new Date('2026-08-02T12:00:00.000Z');
const hash = (value: string) => governanceEvidenceHash(value);

function boundary(overrides = {}) {
  return {
    environment: 'staging',
    deploymentEnvironment: 'staging',
    manualTrigger: true,
    operatorId: 'operator-task-014',
    mfaEventId: 'mfa-task-014',
    authenticatedAt: new Date(now.getTime() - 60_000).toISOString(),
    externalSecretStoreReference: 'vault:staging/governance',
    correlationId: 'task-014-managed-validation',
    confirmation: MANAGED_STAGING_CONFIRMATION,
    now,
    ...overrides,
  };
}

const probeNames: ManagedPreflightProbeName[] = [
  'migration-status',
  'database',
  'redis',
  'object-storage',
  'notification-provider',
  'search-vector',
  'application-health',
  'governance-state',
  'governance-invariants',
  'version-compatibility',
];

function probes(failed?: ManagedPreflightProbeName) {
  return Object.fromEntries(
    probeNames.map((name) => [
      name,
      async () => ({ passed: name !== failed, reference: `${name}-probe` }),
    ]),
  ) as Record<ManagedPreflightProbeName, () => Promise<{ passed: boolean; reference: string }>>;
}

test('managed staging boundary denies production, automation and stale authentication', () => {
  assert.equal(validateManagedStagingBoundary(boundary()).environment, 'staging');
  for (const invalid of [
    boundary({ environment: 'production', deploymentEnvironment: 'production' }),
    boundary({ manualTrigger: false }),
    boundary({ authenticatedAt: new Date(now.getTime() - 11 * 60_000).toISOString() }),
    boundary({ confirmation: 'VALIDATE PRODUCTION' }),
  ]) {
    assert.throws(() => validateManagedStagingBoundary(invalid));
  }
});

test('preflight passes complete read-only probes and fails closed on a blocker or placeholder', async () => {
  const input = {
    boundary: boundary(),
    commitSha: 'abcdef1234567',
    deployedCommitSha: 'abcdef1234567',
    expectedMigrationVersion: '20260802120000_governance_validation',
    featureFlags: { GOVERNANCE_MANAGED_VALIDATION_ENABLED: 'true' },
    requiredFeatureFlags: ['GOVERNANCE_MANAGED_VALIDATION_ENABLED'],
    secrets: { SESSION_SECRET: 'staging-value-from-vault-123456789' },
    requiredSecretNames: ['SESSION_SECRET'],
  };
  const passed = await runManagedStagingPreflight(input, probes());
  assert.equal(passed.status, 'passed');
  assert.equal(passed.checks.length, 13);
  assert.equal((await runManagedStagingPreflight(input, probes('redis'))).status, 'failed');
  assert.equal(
    (
      await runManagedStagingPreflight(
        { ...input, secrets: { SESSION_SECRET: 'test-only-secret-value' } },
        probes(),
      )
    ).status,
    'failed',
  );
});

function evidence(): GovernanceEvidence {
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    environment: 'staging',
    ceremony: 'managed-preflight',
    status: 'passed',
    correlationId: 'task-014-evidence',
    commitSha: 'abcdef1234567',
    migrationVersion: '20260802120000_governance_validation',
    actorHashes: [hash('operator')],
    reviewerSignOff: null,
    records: [
      {
        type: 'database',
        status: 'passed',
        timestamp: now.toISOString(),
        expectedOutcome: 'Read only probe passes',
        actualOutcome: 'passed',
      },
    ],
  };
}

test('canonical evidence and sign-off hashes detect tampering and enforce reviewer separation', () => {
  const envelope = createGovernanceEvidenceEnvelope(evidence());
  assert.equal(verifyGovernanceEvidenceEnvelope(envelope), envelope);
  assert.throws(() =>
    verifyGovernanceEvidenceEnvelope({
      ...envelope,
      evidence: { ...envelope.evidence, status: 'failed' },
    }),
  );
  const signOff: GovernanceSignOff = {
    schemaVersion: 1,
    environment: 'staging',
    ceremony: 'managed-validation',
    status: 'passed',
    commitSha: 'abcdef1234567',
    migrationVersion: '20260802120000_governance_validation',
    correlationId: 'task-014-evidence',
    evidenceSha256: envelope.evidenceSha256,
    operatorHash: hash('operator'),
    reviewerHash: hash('reviewer'),
    operatorSignatureReference: 'approval:operator-signature',
    reviewerSignatureReference: 'approval:reviewer-signature',
    externalApprovalReference: 'change:task-014',
    signedAt: now.toISOString(),
    deviations: [],
    blockers: [],
    riskReferences: ['AR-DEP-2026-002'],
  };
  const signed = createGovernanceSignOffEnvelope(signOff);
  assert.equal(verifyGovernanceSignOffEnvelope(signed), signed);
  assert.throws(() =>
    createGovernanceSignOffEnvelope({ ...signOff, reviewerHash: signOff.operatorHash }),
  );
  assert.throws(() =>
    verifyGovernanceSignOffEnvelope({
      ...signed,
      signOff: { ...signed.signOff, commitSha: 'fffffff' },
    }),
  );
});

function receipts(): GovernanceNotificationReceipt[] {
  return REQUIRED_GOVERNANCE_NOTIFICATION_EVENTS.map((event, index) => ({
    schemaVersion: 1,
    environment: 'staging',
    event,
    correlationId: 'task-014-notifications',
    receiptId: `receipt-${index}`,
    provider: 'resend',
    providerMessageId: `provider-message-${index}`,
    recipientHash: hash(`recipient-${index}`),
    templateId: `governance-${event}-v1`,
    status: 'delivered',
    attempts: 1,
    attemptedAt: now.toISOString(),
    deliveredAt: now.toISOString(),
    failureCode: null,
    deadLetterVisible: false,
  }));
}

test('notification evidence is sanitized and requires every real delivery receipt', () => {
  assert.deepEqual(
    sanitizeNotificationProviderRecord({
      providerId: 'provider-1',
      subject: 'must disappear',
      recipientEmail: 'must disappear',
      status: 'delivered',
    }),
    { providerId: 'provider-1', status: 'delivered' },
  );
  assert.equal(validateGovernanceNotificationSet(receipts()).length, receipts().length);
  assert.throws(() => validateGovernanceNotificationSet(receipts().slice(1)));
  assert.throws(() =>
    validateGovernanceNotificationSet(
      receipts().map((receipt, index) =>
        index === 0 ? { ...receipt, status: 'failed', deliveredAt: null } : receipt,
      ),
    ),
  );
  const failure = {
    ...receipts()[0]!,
    status: 'dead-lettered' as const,
    attempts: 3,
    deliveredAt: null,
    failureCode: 'provider-temporary-rejection',
    deadLetterVisible: true,
  };
  assert.equal(
    validateGovernanceNotificationBundle({
      schemaVersion: 1,
      deliveries: receipts(),
      failureObservation: failure,
    }).failureObservation,
    failure,
  );
});

test('invalidation uses bounded polling and fails on any stale state', async () => {
  let clock = 0;
  let calls = 0;
  const result = await pollGovernanceCondition({
    timeoutMs: 1_000,
    intervalMs: 100,
    now: () => clock,
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
    check: async () => ++calls === 3,
  });
  assert.deepEqual(result, { passed: true, attempts: 3, durationMs: 200 });
  const observation = {
    schemaVersion: 1 as const,
    environment: 'staging' as const,
    correlationId: 'task-014-invalidation',
    articleHash: hash('article'),
    companyHash: hash('company'),
    oldCacheKeyHash: hash('cache-key'),
    oldCacheKeyExisted: true,
    versionBefore: 1,
    versionAfter: 2,
    relevantCacheInvalidated: true,
    searchIndexUpdated: true,
    vectorIndexUpdated: true,
    stalePublicResultAbsent: true,
    tenantPrivatePublicCacheAbsent: true,
    foreignTenantDenied: true,
    retryIdempotent: true,
    failedReindexVisible: true,
    pollingAttempts: 3,
    pollingDurationMs: 200,
  };
  assert.equal(validateGovernanceInvalidationObservation(observation), observation);
  assert.throws(() =>
    validateGovernanceInvalidationObservation({ ...observation, stalePublicResultAbsent: false }),
  );
});

test('dependency report requires active classified risk and never accepts critical findings', () => {
  const audit = {
    auditReportVersion: 2,
    vulnerabilities: {
      postcss: {
        name: 'postcss',
        severity: 'high',
        isDirect: false,
        range: '<=8.5.17',
        nodes: ['node_modules/next/node_modules/postcss'],
        fixAvailable: { name: 'next', version: '9.3.3', isSemVerMajor: true },
        via: [],
      },
    },
  } satisfies NpmAuditReport;
  const acceptance = {
    id: 'AR-DEP-2026-002',
    packages: ['postcss'],
    exposure: 'build-time' as const,
    compensatingControls: ['repository-controlled-css-input-only'],
    owner: 'platform-security',
    expiresAt: '2026-08-12T23:59:59.000Z',
    remediationTrigger: 'upstream-fixed-version-available',
  };
  assert.equal(analyzeDependencyAudit({ audit, acceptances: [acceptance], now }).status, 'passed');
  assert.equal(analyzeDependencyAudit({ audit, acceptances: [], now }).status, 'failed');
  assert.throws(() =>
    validateDependencyRiskAcceptance({ ...acceptance, expiresAt: now.toISOString() }, now),
  );
  assert.equal(
    analyzeDependencyAudit({
      audit: {
        ...audit,
        vulnerabilities: { postcss: { ...audit.vulnerabilities.postcss, severity: 'critical' } },
      },
      acceptances: [acceptance],
      now,
    }).status,
    'failed',
  );
});

test('ceremony and last-owner recovery policies require synthetic data and two people', () => {
  assert.equal(
    validateManagedCeremonyManifest({
      schemaVersion: 1,
      environment: 'staging',
      ceremony: 'support',
      correlationId: 'task-014-support',
      syntheticData: true,
      operatorHash: hash('operator'),
      reviewerHash: hash('reviewer'),
      auditEventIds: ['audit-1'],
      notificationReceiptIds: ['receipt-1'],
      negativeChecks: ['foreign-scope-denied'],
      rollbackChecks: ['access-after-termination-denied'],
      status: 'passed',
    }).status,
    'passed',
  );
  const recovery = {
    schemaVersion: 1 as const,
    environment: 'staging' as const,
    mode: 'policy-drill' as const,
    targetUserHash: hash('target'),
    operatorHash: hash('operator'),
    reviewerHash: hash('reviewer'),
    externalAuthorityReference: 'change:task-014-recovery',
    operatorMfaReference: 'mfa:operator',
    reviewerMfaReference: 'mfa:reviewer',
    operatorAuthenticatedAt: now.toISOString(),
    reviewerAuthenticatedAt: now.toISOString(),
    temporaryGrantExpiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
    correlationId: 'task-014-recovery',
    confirmation: 'DRILL LAST OWNER RECOVERY IN STAGING' as const,
    now,
  };
  assert.equal(validateLastOwnerRecoveryDrill(recovery).status, 'policy-validated');
  assert.throws(() =>
    validateLastOwnerRecoveryDrill({ ...recovery, environment: 'production' as never }),
  );
  assert.throws(() =>
    validateLastOwnerRecoveryDrill({ ...recovery, reviewerHash: recovery.operatorHash }),
  );
});
