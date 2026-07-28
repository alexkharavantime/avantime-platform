import type { DocumentTenantContext } from './document-model';

export class ApiRateLimitError extends Error {
  readonly code = 'API_RATE_LIMITED';
}

const usage = new Map<string, { minute: number; count: number }>();

export function assertApiRateLimit(
  tenant: DocumentTenantContext,
  maximumPerMinute: number,
  now = new Date(),
) {
  const minute = Math.floor(now.getTime() / 60_000);
  const key = `${tenant.companyId}:${tenant.userId}`;
  const current = usage.get(key);
  if (current?.minute === minute && current.count >= maximumPerMinute) {
    throw new ApiRateLimitError('API request limit exceeded.');
  }
  usage.set(key, {
    minute,
    count: current?.minute === minute ? current.count + 1 : 1,
  });
}

export function resetApiRateLimitsForTests() {
  usage.clear();
}
