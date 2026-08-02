const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,199}$/u;

export async function pollGovernanceCondition(input: {
  check: () => Promise<boolean>;
  timeoutMs: number;
  intervalMs: number;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}) {
  if (
    !Number.isSafeInteger(input.timeoutMs) ||
    !Number.isSafeInteger(input.intervalMs) ||
    input.timeoutMs < 1 ||
    input.timeoutMs > 120_000 ||
    input.intervalMs < 1 ||
    input.intervalMs > input.timeoutMs
  ) {
    throw new Error('INVALIDATION_POLL_CONFIGURATION_INVALID');
  }
  const now = input.now ?? Date.now;
  const wait =
    input.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const startedAt = now();
  let attempts = 0;
  do {
    attempts += 1;
    if (await input.check())
      return { passed: true as const, attempts, durationMs: now() - startedAt };
    const remaining = input.timeoutMs - (now() - startedAt);
    if (remaining <= 0) break;
    await wait(Math.min(input.intervalMs, remaining));
  } while (now() - startedAt <= input.timeoutMs);
  return { passed: false as const, attempts, durationMs: now() - startedAt };
}

export type GovernanceInvalidationObservation = {
  schemaVersion: 1;
  environment: 'staging';
  correlationId: string;
  articleHash: string;
  companyHash: string;
  oldCacheKeyHash: string;
  oldCacheKeyExisted: boolean;
  versionBefore: number;
  versionAfter: number;
  relevantCacheInvalidated: boolean;
  searchIndexUpdated: boolean;
  vectorIndexUpdated: boolean;
  stalePublicResultAbsent: boolean;
  tenantPrivatePublicCacheAbsent: boolean;
  foreignTenantDenied: boolean;
  retryIdempotent: boolean;
  failedReindexVisible: boolean;
  pollingAttempts: number;
  pollingDurationMs: number;
};

export function validateGovernanceInvalidationObservation(
  observation: GovernanceInvalidationObservation,
) {
  const allowedKeys = new Set([
    'schemaVersion',
    'environment',
    'correlationId',
    'articleHash',
    'companyHash',
    'oldCacheKeyHash',
    'oldCacheKeyExisted',
    'versionBefore',
    'versionAfter',
    'relevantCacheInvalidated',
    'searchIndexUpdated',
    'vectorIndexUpdated',
    'stalePublicResultAbsent',
    'tenantPrivatePublicCacheAbsent',
    'foreignTenantDenied',
    'retryIdempotent',
    'failedReindexVisible',
    'pollingAttempts',
    'pollingDurationMs',
  ]);
  if (
    Object.keys(observation).some((key) => !allowedKeys.has(key)) ||
    observation.schemaVersion !== 1 ||
    observation.environment !== 'staging' ||
    !SAFE_REFERENCE.test(observation.correlationId) ||
    ![observation.articleHash, observation.companyHash, observation.oldCacheKeyHash].every(
      (value) => /^[a-f0-9]{64}$/u.test(value),
    ) ||
    !Number.isSafeInteger(observation.versionBefore) ||
    !Number.isSafeInteger(observation.versionAfter) ||
    observation.versionAfter <= observation.versionBefore ||
    !Number.isSafeInteger(observation.pollingAttempts) ||
    observation.pollingAttempts < 1 ||
    !Number.isSafeInteger(observation.pollingDurationMs) ||
    observation.pollingDurationMs < 0 ||
    observation.pollingDurationMs > 120_000
  ) {
    throw new Error('GOVERNANCE_INVALIDATION_OBSERVATION_INVALID');
  }
  const required = [
    observation.oldCacheKeyExisted,
    observation.relevantCacheInvalidated,
    observation.searchIndexUpdated,
    observation.vectorIndexUpdated,
    observation.stalePublicResultAbsent,
    observation.tenantPrivatePublicCacheAbsent,
    observation.foreignTenantDenied,
    observation.retryIdempotent,
    observation.failedReindexVisible,
  ];
  if (!required.every(Boolean)) throw new Error('GOVERNANCE_INVALIDATION_FAILED');
  return observation;
}
