import type { RedisCommandClient } from './redis-lease-queue';

const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/u;

export type StagingRedisArea = 'cache' | 'rate-limit' | 'session' | 'worker';

export function stagingRedisKey(input: {
  namespace: string;
  area: StagingRedisArea;
  tenantId: string;
  resource: string;
}) {
  if (!input.namespace.includes(':staging:')) throw new Error('REDIS_NAMESPACE_NOT_STAGING');
  for (const [name, value] of [
    ['tenantId', input.tenantId],
    ['resource', input.resource],
  ] as const) {
    if (!SAFE_SEGMENT.test(value)) throw new Error(`REDIS_${name.toUpperCase()}_INVALID`);
  }
  return `${input.namespace}:${input.area}:${input.tenantId}:${input.resource}`;
}

export async function probeStagingRedis(
  client: RedisCommandClient,
  namespace: string,
  correlationId: string,
) {
  const key = stagingRedisKey({
    namespace,
    area: 'worker',
    tenantId: 'system',
    resource: `readiness-${correlationId}`,
  });
  try {
    const set = await client.sendCommand(['SET', key, correlationId, 'EX', '30', 'NX']);
    if (String(set) !== 'OK') throw new Error('REDIS_READINESS_WRITE_FAILED');
    const value = await client.sendCommand(['GET', key]);
    if (String(value) !== correlationId) throw new Error('REDIS_READINESS_READ_FAILED');
    return { ready: true as const };
  } finally {
    await client.sendCommand(['DEL', key]).catch(() => undefined);
  }
}
