import { createHash } from 'node:crypto';

import { createLazyRedisCommandClient, type RedisCommandClient } from './redis-lease-queue';

export type IdentityRateLimitScope =
  | 'login-identifier'
  | 'login-ip'
  | 'password-reset-identifier'
  | 'password-reset-ip'
  | 'email-verification-identifier'
  | 'email-verification-ip'
  | 'mfa-challenge'
  | 'mfa-enrollment'
  | 'invitation';

export type IdentityRateLimitRequest = {
  scope: IdentityRateLimitScope;
  subject: string;
  limit: number;
  windowSeconds: number;
};

export interface IdentityRateLimiter {
  readonly kind: 'memory' | 'redis';
  consume(request: IdentityRateLimitRequest): Promise<boolean>;
}

function validateRequest(request: IdentityRateLimitRequest) {
  if (
    !Number.isSafeInteger(request.limit) ||
    request.limit < 1 ||
    !Number.isSafeInteger(request.windowSeconds) ||
    request.windowSeconds < 1 ||
    request.windowSeconds > 86_400
  ) {
    throw new Error('Identity rate limit configuration is invalid.');
  }
}

function keyFor(request: IdentityRateLimitRequest) {
  const subjectHash = createHash('sha256').update(request.subject).digest('hex');
  return `avantime:identity-rate:${request.scope}:${subjectHash}`;
}

export class MemoryIdentityRateLimiter implements IdentityRateLimiter {
  readonly kind = 'memory';
  private readonly entries = new Map<string, number[]>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async consume(request: IdentityRateLimitRequest) {
    validateRequest(request);
    const now = this.now().getTime();
    const cutoff = now - request.windowSeconds * 1000;
    const retained = (this.entries.get(keyFor(request)) ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );
    if (retained.length >= request.limit) return false;
    retained.push(now);
    this.entries.set(keyFor(request), retained);
    return true;
  }
}

const redisIdentityLimitScript = `
local serverTime = redis.call('TIME')
local nowMs = (serverTime[1] * 1000) + math.floor(serverTime[2] / 1000)
local cutoff = nowMs - tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[2]) then
  return 0
end
redis.call('ZADD', KEYS[1], nowMs, ARGV[3])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]) + 1000)
return 1
`;

export class RedisIdentityRateLimiter implements IdentityRateLimiter {
  readonly kind = 'redis';

  constructor(private readonly client: RedisCommandClient) {}

  async consume(request: IdentityRateLimitRequest) {
    validateRequest(request);
    const result = await this.client.sendCommand([
      'EVAL',
      redisIdentityLimitScript,
      '1',
      keyFor(request),
      String(request.windowSeconds * 1000),
      String(request.limit),
      crypto.randomUUID(),
    ]);
    return Number(result) === 1;
  }
}

let limiter: IdentityRateLimiter | undefined;

export function getIdentityRateLimiter(
  environment: Record<string, string | undefined> = process.env,
) {
  if (limiter) return limiter;
  if (environment.REDIS_URL) {
    limiter = new RedisIdentityRateLimiter(createLazyRedisCommandClient(environment.REDIS_URL));
    return limiter;
  }
  if (environment.NODE_ENV === 'production') {
    throw new Error('Production identity rate limiting requires REDIS_URL.');
  }
  limiter = new MemoryIdentityRateLimiter();
  return limiter;
}

export function setIdentityRateLimiterForTests(value?: IdentityRateLimiter) {
  limiter = value;
}
