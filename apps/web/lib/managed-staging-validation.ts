import { governanceEvidenceHash } from './governance-evidence';

const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,199}$/u;
const SENSITIVE_KEY = /(?:authorization|cookie|credential|email|password|secret|session|token)/iu;
const PLACEHOLDER = /(?:change.?me|example|placeholder|test.?only|dummy|password|secret|todo)/iu;
const RECENT_AUTH_MS = 10 * 60_000;

export const MANAGED_STAGING_CONFIRMATION = 'VALIDATE MANAGED STAGING GOVERNANCE';

export type ManagedValidationPlane = 'local' | 'ci' | 'managed-staging' | 'production';

export type ManagedStagingBoundary = {
  environment: string;
  deploymentEnvironment: string;
  manualTrigger: boolean;
  operatorId: string;
  mfaEventId: string;
  authenticatedAt: string;
  externalSecretStoreReference: string;
  correlationId: string;
  confirmation: string;
  now?: Date;
};

export type ManagedPreflightProbeName =
  | 'migration-status'
  | 'database'
  | 'redis'
  | 'object-storage'
  | 'notification-provider'
  | 'search-vector'
  | 'application-health'
  | 'governance-state'
  | 'governance-invariants'
  | 'version-compatibility';

export type ManagedPreflightProbeResult = {
  passed: boolean;
  reference: string;
  details?: Record<string, string | number | boolean | null>;
};

export type ManagedPreflightProbe = () => Promise<ManagedPreflightProbeResult>;

export type ManagedPreflightInput = {
  boundary: ManagedStagingBoundary;
  commitSha: string;
  deployedCommitSha: string;
  expectedMigrationVersion: string;
  featureFlags: Record<string, string | undefined>;
  requiredFeatureFlags: string[];
  secrets: Record<string, string | undefined>;
  requiredSecretNames: string[];
};

export type ManagedPreflightReport = {
  schemaVersion: 1;
  status: 'passed' | 'failed';
  environment: 'staging';
  correlationId: string;
  operatorHash: string;
  commitSha: string;
  expectedMigrationVersion: string;
  checkedAt: string;
  checks: Array<{
    gate: string;
    status: 'passed' | 'failed';
    blocker: boolean;
    reference: string;
    details?: Record<string, string | number | boolean | null>;
  }>;
};

export function classifyManagedValidationPlane(input: {
  environment?: string;
  ci?: boolean;
}): ManagedValidationPlane {
  if (input.environment === 'production') return 'production';
  if (input.environment === 'staging') return 'managed-staging';
  return input.ci ? 'ci' : 'local';
}

export function validateManagedStagingBoundary(input: ManagedStagingBoundary) {
  const now = input.now ?? new Date();
  const authenticatedAt = new Date(input.authenticatedAt);
  if (input.environment !== 'staging' || input.deploymentEnvironment !== 'staging') {
    throw new Error('MANAGED_STAGING_ENVIRONMENT_DENIED');
  }
  if (!input.manualTrigger) throw new Error('MANAGED_STAGING_MANUAL_TRIGGER_REQUIRED');
  if (input.confirmation !== MANAGED_STAGING_CONFIRMATION) {
    throw new Error('MANAGED_STAGING_CONFIRMATION_REQUIRED');
  }
  if (
    !SAFE_REFERENCE.test(input.operatorId) ||
    !SAFE_REFERENCE.test(input.mfaEventId) ||
    !SAFE_REFERENCE.test(input.externalSecretStoreReference) ||
    !SAFE_REFERENCE.test(input.correlationId)
  ) {
    throw new Error('MANAGED_STAGING_REFERENCE_INVALID');
  }
  if (
    !Number.isFinite(authenticatedAt.getTime()) ||
    authenticatedAt > now ||
    now.getTime() - authenticatedAt.getTime() > RECENT_AUTH_MS
  ) {
    throw new Error('MANAGED_STAGING_RECENT_AUTH_REQUIRED');
  }
  return {
    environment: 'staging' as const,
    operatorHash: governanceEvidenceHash(input.operatorId),
    correlationId: input.correlationId,
    checkedAt: now,
  };
}

function validateSafeProbeResult(result: ManagedPreflightProbeResult) {
  if (!SAFE_REFERENCE.test(result.reference)) throw new Error('PREFLIGHT_PROBE_REFERENCE_INVALID');
  for (const [key, value] of Object.entries(result.details ?? {})) {
    if (
      SENSITIVE_KEY.test(key) ||
      !SAFE_REFERENCE.test(key) ||
      (typeof value === 'string' && !SAFE_REFERENCE.test(value)) ||
      (typeof value === 'number' && !Number.isFinite(value))
    ) {
      throw new Error('PREFLIGHT_PROBE_DETAILS_UNSAFE');
    }
  }
  return result;
}

function configurationChecks(input: ManagedPreflightInput) {
  const checks: ManagedPreflightReport['checks'] = [];
  const commitValid =
    /^[a-f0-9]{7,64}$/u.test(input.commitSha) && input.commitSha === input.deployedCommitSha;
  checks.push({
    gate: 'commit-sha',
    status: commitValid ? 'passed' : 'failed',
    blocker: !commitValid,
    reference: commitValid ? 'deployed-commit-match' : 'deployed-commit-mismatch',
  });
  const flagsValid = input.requiredFeatureFlags.every(
    (name) => input.featureFlags[name]?.trim().toLowerCase() === 'true',
  );
  checks.push({
    gate: 'required-feature-flags',
    status: flagsValid ? 'passed' : 'failed',
    blocker: !flagsValid,
    reference: flagsValid ? 'required-flags-enabled' : 'required-flags-missing',
  });
  const secretsValid = input.requiredSecretNames.every((name) => {
    const value = input.secrets[name]?.trim();
    return Boolean(value && value.length >= 16 && !PLACEHOLDER.test(value));
  });
  checks.push({
    gate: 'external-secrets',
    status: secretsValid ? 'passed' : 'failed',
    blocker: !secretsValid,
    reference: secretsValid ? 'secret-presence-valid' : 'secret-presence-invalid',
  });
  return checks;
}

export async function runManagedStagingPreflight(
  input: ManagedPreflightInput,
  probes: Record<ManagedPreflightProbeName, ManagedPreflightProbe>,
): Promise<ManagedPreflightReport> {
  const boundary = validateManagedStagingBoundary(input.boundary);
  const requiredProbeNames: ManagedPreflightProbeName[] = [
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
  if (
    input.requiredFeatureFlags.length === 0 ||
    input.requiredSecretNames.length === 0 ||
    requiredProbeNames.some((name) => typeof probes[name] !== 'function')
  ) {
    throw new Error('PREFLIGHT_REQUIRED_CONFIGURATION_EMPTY');
  }
  if (!SAFE_REFERENCE.test(input.expectedMigrationVersion)) {
    throw new Error('PREFLIGHT_MIGRATION_VERSION_INVALID');
  }
  const checks = configurationChecks(input);
  for (const [gate, probe] of Object.entries(probes) as Array<
    [ManagedPreflightProbeName, ManagedPreflightProbe]
  >) {
    try {
      const result = validateSafeProbeResult(await probe());
      checks.push({
        gate,
        status: result.passed ? 'passed' : 'failed',
        blocker: !result.passed,
        reference: result.reference,
        details: result.details,
      });
    } catch (error) {
      const code =
        error instanceof Error && SAFE_REFERENCE.test(error.message)
          ? error.message
          : 'preflight-probe-failed';
      checks.push({ gate, status: 'failed', blocker: true, reference: code });
    }
  }
  return {
    schemaVersion: 1,
    status: checks.every((check) => check.status === 'passed') ? 'passed' : 'failed',
    environment: boundary.environment,
    correlationId: boundary.correlationId,
    operatorHash: boundary.operatorHash,
    commitSha: input.commitSha,
    expectedMigrationVersion: input.expectedMigrationVersion,
    checkedAt: boundary.checkedAt.toISOString(),
    checks,
  };
}

export type ManagedCeremonyManifest = {
  schemaVersion: 1;
  environment: 'staging';
  ceremony: 'support' | 'approval' | 'knowledge';
  correlationId: string;
  syntheticData: true;
  operatorHash: string;
  reviewerHash: string;
  auditEventIds: string[];
  notificationReceiptIds: string[];
  negativeChecks: string[];
  rollbackChecks: string[];
  status: 'passed' | 'failed';
};

export function validateManagedCeremonyManifest(manifest: ManagedCeremonyManifest) {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.environment !== 'staging' ||
    !['support', 'approval', 'knowledge'].includes(manifest.ceremony) ||
    !['passed', 'failed'].includes(manifest.status) ||
    manifest.syntheticData !== true ||
    !SAFE_REFERENCE.test(manifest.correlationId) ||
    !/^[a-f0-9]{64}$/u.test(manifest.operatorHash) ||
    !/^[a-f0-9]{64}$/u.test(manifest.reviewerHash) ||
    manifest.operatorHash === manifest.reviewerHash ||
    manifest.auditEventIds.length === 0 ||
    manifest.notificationReceiptIds.length === 0 ||
    manifest.negativeChecks.length === 0 ||
    manifest.rollbackChecks.length === 0 ||
    ![
      ...manifest.auditEventIds,
      ...manifest.notificationReceiptIds,
      ...manifest.negativeChecks,
      ...manifest.rollbackChecks,
    ].every((value) => SAFE_REFERENCE.test(value))
  ) {
    throw new Error('MANAGED_CEREMONY_EVIDENCE_INVALID');
  }
  if (manifest.status !== 'passed') throw new Error('MANAGED_CEREMONY_FAILED');
  return manifest;
}

export type LastOwnerRecoveryDrill = {
  schemaVersion: 1;
  environment: 'staging';
  mode: 'policy-drill';
  targetUserHash: string;
  operatorHash: string;
  reviewerHash: string;
  externalAuthorityReference: string;
  operatorMfaReference: string;
  reviewerMfaReference: string;
  operatorAuthenticatedAt: string;
  reviewerAuthenticatedAt: string;
  temporaryGrantExpiresAt: string;
  correlationId: string;
  confirmation: 'DRILL LAST OWNER RECOVERY IN STAGING';
  now?: Date;
};

export function validateLastOwnerRecoveryDrill(input: LastOwnerRecoveryDrill) {
  const now = input.now ?? new Date();
  const operatorAuth = new Date(input.operatorAuthenticatedAt);
  const reviewerAuth = new Date(input.reviewerAuthenticatedAt);
  const expiresAt = new Date(input.temporaryGrantExpiresAt);
  if (
    input.environment !== 'staging' ||
    input.mode !== 'policy-drill' ||
    input.confirmation !== 'DRILL LAST OWNER RECOVERY IN STAGING' ||
    ![input.targetUserHash, input.operatorHash, input.reviewerHash].every((value) =>
      /^[a-f0-9]{64}$/u.test(value),
    ) ||
    input.operatorHash === input.reviewerHash ||
    ![
      input.externalAuthorityReference,
      input.operatorMfaReference,
      input.reviewerMfaReference,
      input.correlationId,
    ].every((value) => SAFE_REFERENCE.test(value)) ||
    ![operatorAuth, reviewerAuth, expiresAt].every((value) => Number.isFinite(value.getTime())) ||
    operatorAuth > now ||
    reviewerAuth > now ||
    now.getTime() - operatorAuth.getTime() > RECENT_AUTH_MS ||
    now.getTime() - reviewerAuth.getTime() > RECENT_AUTH_MS ||
    expiresAt <= now ||
    expiresAt.getTime() - now.getTime() > 60 * 60_000
  ) {
    throw new Error('LAST_OWNER_RECOVERY_DRILL_DENIED');
  }
  return { status: 'policy-validated' as const, environment: 'staging' as const };
}
