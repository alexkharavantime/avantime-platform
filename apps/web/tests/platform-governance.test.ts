import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approvalStepUpSatisfied,
  governanceApprovalExecutorConnected,
  getGovernanceApprovalPolicy,
  governanceApprovalFingerprint,
} from '../lib/governance-approval-policy';
import {
  hashBootstrapAuthorization,
  PlatformOwnerBootstrapError,
  validatePlatformOwnerBootstrapRequest,
} from '../lib/platform-owner-bootstrap';
import { validateGovernanceEvidence } from '../lib/governance-evidence';
import { validateGovernancePermissionContracts } from '../lib/governance-invariants';
import { governanceMutationOriginAllowed } from '../lib/governance-request-security';
import {
  evaluatePlatformPermission,
  permissionsForPlatformRole,
  type PlatformSystemRole,
} from '../lib/platform-permissions';
import type { AppSession } from '../lib/session';

function session(overrides: Partial<AppSession> = {}): AppSession {
  return {
    userId: 'platform-user',
    name: 'Platform User',
    email: 'platform@example.test',
    company: 'Organization projection must not authorize platform access',
    companyId: 'organization-a',
    role: 'CLIENT',
    organizationRole: 'OWNER',
    membershipStatus: 'ACTIVE',
    membershipVersion: 1,
    mfaSatisfied: true,
    authenticationAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

function assignment(role: PlatformSystemRole, overrides: Record<string, unknown> = {}) {
  return {
    id: `assignment-${role}`,
    userId: 'platform-user',
    role,
    active: true,
    version: 1,
    ...overrides,
  };
}

test('platform permissions are independent from organization role and deny unknown state', () => {
  assert.equal(
    evaluatePlatformPermission({ session: session(), permission: 'platform.view' }).reasonCode,
    'ASSIGNMENT_REQUIRED',
  );
  assert.equal(
    evaluatePlatformPermission({
      session: session(),
      assignment: assignment('PLATFORM_ADMIN', { active: false }),
      permission: 'platform.view',
    }).reasonCode,
    'ASSIGNMENT_INACTIVE',
  );
  assert.equal(
    evaluatePlatformPermission({
      session: session(),
      assignment: assignment('PLATFORM_ADMIN'),
      permission: 'platform.unknown',
    }).reasonCode,
    'UNKNOWN_PERMISSION',
  );
  assert.equal(
    evaluatePlatformPermission({
      session: session(),
      assignment: { ...assignment('PLATFORM_ADMIN'), role: 'UNKNOWN' },
      permission: 'platform.view',
    }).reasonCode,
    'UNKNOWN_ROLE',
  );
});

test('support, auditor and operator roles remain least privilege', () => {
  assert.equal(
    permissionsForPlatformRole('PLATFORM_AUDITOR').includes('platform.configure'),
    false,
  );
  assert.equal(
    permissionsForPlatformRole('PLATFORM_SUPPORT').includes('platform.roles.manage'),
    false,
  );
  assert.equal(
    permissionsForPlatformRole('PLATFORM_OPERATOR').includes('platform.jobs.retry'),
    true,
  );
  assert.equal(
    permissionsForPlatformRole('PLATFORM_OPERATOR').includes('platform.audit.export'),
    false,
  );
});

test('cross-tenant support permission requires a live exact-scope session', () => {
  const base = {
    session: session(),
    assignment: assignment('PLATFORM_SUPPORT'),
    permission: 'platform.support.resource.view' as const,
    operationalContext: { companyId: 'organization-b', requireSupportSession: true },
  };
  assert.equal(evaluatePlatformPermission(base).reasonCode, 'SUPPORT_SESSION_REQUIRED');
  assert.equal(
    evaluatePlatformPermission({
      ...base,
      supportSession: {
        id: 'support-session',
        actorId: 'platform-user',
        companyId: 'organization-b',
        allowedScopes: ['platform.support.resource.view'],
        expiresAt: new Date(Date.now() + 60_000),
      },
    }).allowed,
    true,
  );
  assert.equal(
    evaluatePlatformPermission({
      ...base,
      supportSession: {
        id: 'support-session',
        actorId: 'platform-user',
        companyId: 'organization-c',
        allowedScopes: ['platform.support.resource.view'],
        expiresAt: new Date(Date.now() + 60_000),
      },
    }).reasonCode,
    'SUPPORT_SESSION_INVALID',
  );
});

test('approval registry is fail-closed and fingerprint is canonical and secret-safe', () => {
  assert.equal(getGovernanceApprovalPolicy('UNKNOWN'), null);
  assert.equal(
    getGovernanceApprovalPolicy('CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION')
      ?.requiredApproverPermission,
    'platform.security.manage',
  );
  const input = {
    actionType: 'PLATFORM_OWNER_ASSIGN' as const,
    scope: 'PLATFORM' as const,
    resourceId: 'assignment-target',
    expectedVersion: 1,
    requesterId: 'requester',
    expiresAt: new Date('2026-08-01T12:00:00.000Z'),
  };
  const left = governanceApprovalFingerprint({
    ...input,
    safeParameters: { targetUserId: 'user-2', assignmentVersion: 1 },
  });
  const right = governanceApprovalFingerprint({
    ...input,
    safeParameters: { assignmentVersion: 1, targetUserId: 'user-2' },
  });
  assert.equal(left, right);
  assert.match(left, /^[a-f0-9]{64}$/u);
  assert.throws(
    () =>
      governanceApprovalFingerprint({
        ...input,
        safeParameters: { secret: 'must-not-be-recorded' },
      }),
    /UNSAFE_APPROVAL_PARAMETER/u,
  );
  assert.throws(
    () => governanceApprovalFingerprint({ ...input, safeParameters: { targetUserId: 'user-2' } }),
    /UNSAFE_APPROVAL_PARAMETER/u,
  );
});

test('approval step-up requires MFA and authentication within ten minutes', () => {
  const now = new Date('2026-08-01T12:00:00.000Z');
  assert.equal(
    approvalStepUpSatisfied({
      mfaSatisfied: true,
      authenticationAt: now.getTime() - 9 * 60_000,
      now,
    }),
    true,
  );
  assert.equal(
    approvalStepUpSatisfied({
      mfaSatisfied: true,
      authenticationAt: now.getTime() - 11 * 60_000,
      now,
    }),
    false,
  );
  assert.equal(
    approvalStepUpSatisfied({ mfaSatisfied: false, authenticationAt: now.getTime(), now }),
    false,
  );
  assert.equal(
    approvalStepUpSatisfied({
      mfaSatisfied: true,
      authenticationAt: now.getTime() + 60_000,
      now,
    }),
    false,
  );
});

test('first platform owner bootstrap requires environment binding, exact phrase and one-use authorization', () => {
  const now = new Date('2026-08-01T12:00:00.000Z');
  const token = 'integration-bootstrap-authorization-token-v1';
  const input = {
    environment: 'integration',
    expectedEnvironment: 'integration',
    targetUserId: 'bootstrap-user',
    targetEmail: 'OWNER@EXAMPLE.TEST',
    sessionEvidenceId: 'bootstrap-session',
    mfaEventEvidenceId: 'bootstrap-mfa-event',
    authorizationId: 'change-task-013',
    authorizationExpiresAt: new Date(now.getTime() + 5 * 60_000),
    authorizationToken: token,
    expectedAuthorizationHash: hashBootstrapAuthorization(token),
    confirmation: 'BOOTSTRAP FIRST PLATFORM OWNER',
    now,
  };
  const validated = validatePlatformOwnerBootstrapRequest(input);
  assert.equal(validated.targetEmailNormalized, 'owner@example.test');
  assert.match(validated.authorizationHash, /^[a-f0-9]{64}$/u);
  for (const invalid of [
    { ...input, environment: 'production', expectedEnvironment: 'production' },
    { ...input, expectedEnvironment: 'staging' },
    { ...input, confirmation: 'BOOTSTRAP OWNER' },
    { ...input, authorizationToken: `${token}-wrong` },
    { ...input, authorizationExpiresAt: new Date(now.getTime() - 1) },
  ]) {
    assert.throws(
      () => validatePlatformOwnerBootstrapRequest(invalid),
      (error: unknown) => error instanceof PlatformOwnerBootstrapError,
    );
  }
});

test('governance evidence rejects secret-bearing fields and approval registry is executor-aware', () => {
  const evidence = {
    schemaVersion: 1 as const,
    generatedAt: '2026-08-01T12:00:00.000Z',
    environment: 'integration' as const,
    ceremony: 'invariants' as const,
    status: 'passed' as const,
    correlationId: 'task-013-integration',
    commitSha: 'abcdef1234567',
    migrationVersion: '20260802120000_governance_validation',
    actorHashes: ['a'.repeat(64)],
    reviewerSignOff: null,
    records: [
      {
        type: 'active-platform-owner',
        status: 'passed' as const,
        timestamp: '2026-08-01T12:00:00.000Z',
        expectedOutcome: 'At least one active owner',
        actualOutcome: '1',
        details: { count: 1 },
      },
    ],
  };
  assert.equal(validateGovernanceEvidence(evidence), evidence);
  assert.throws(
    () =>
      validateGovernanceEvidence({
        ...evidence,
        records: [{ ...evidence.records[0], details: { token: 'must-not-appear' } }],
      }),
    /GOVERNANCE_EVIDENCE_SENSITIVE/u,
  );
  assert.equal(governanceApprovalExecutorConnected('PLATFORM_OWNER_ASSIGN'), true);
  assert.equal(governanceApprovalExecutorConnected('IDENTITY_PROVIDER_DELETE'), false);
});

test('governance invariant contracts reject disabled assignments and expired support sessions', () => {
  assert.deepEqual(validateGovernancePermissionContracts(new Date('2026-08-01T12:00:00.000Z')), {
    disabledAssignmentDenied: true,
    expiredSupportDenied: true,
  });
});

test('governance mutations require the configured same origin', () => {
  const previous = process.env.AUTH_PUBLIC_ORIGIN;
  process.env.AUTH_PUBLIC_ORIGIN = 'https://staging.example.test';
  try {
    assert.equal(
      governanceMutationOriginAllowed(
        new Request('https://staging.example.test/api/governance/approvals', {
          method: 'POST',
          headers: { origin: 'https://staging.example.test', 'sec-fetch-site': 'same-origin' },
        }),
      ),
      true,
    );
    assert.equal(
      governanceMutationOriginAllowed(
        new Request('https://staging.example.test/api/governance/approvals', {
          method: 'POST',
          headers: { origin: 'https://evil.example.test', 'sec-fetch-site': 'cross-site' },
        }),
      ),
      false,
    );
    assert.equal(
      governanceMutationOriginAllowed(
        new Request('https://staging.example.test/api/governance/approvals', { method: 'POST' }),
      ),
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.AUTH_PUBLIC_ORIGIN;
    else process.env.AUTH_PUBLIC_ORIGIN = previous;
  }
});
