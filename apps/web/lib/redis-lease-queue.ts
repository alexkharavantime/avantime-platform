import { createClient } from 'redis';

import type { DocumentTenantContext } from './document-model';
import type {
  DocumentEnqueueResult,
  DocumentProcessingJob,
  ExternalDocumentProcessingQueue,
} from './document-processing-queue';
import type { EmbeddingEnqueueResult, EmbeddingJob, EmbeddingJobQueue } from './embedding-queue';
import { assertDocumentTenantContext, assertSafeDocumentSegment } from './document-storage';

export type RedisCommandClient = {
  sendCommand(arguments_: string[]): Promise<unknown>;
  close?(): Promise<void>;
};

export async function createRedisCommandClient(url: string): Promise<RedisCommandClient> {
  const client = createClient({
    url,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: false,
    },
  });
  client.on('error', () => undefined);
  await client.connect();
  return {
    sendCommand: (arguments_) => client.sendCommand(arguments_),
    close: () => client.close(),
  };
}

export function createLazyRedisCommandClient(url: string): RedisCommandClient {
  let connection: Promise<RedisCommandClient> | undefined;
  const connect = () => (connection ??= createRedisCommandClient(url));
  return {
    sendCommand: async (arguments_) => (await connect()).sendCommand(arguments_),
    close: async () => (await connect()).close?.(),
  };
}

type RedisLeasedJob = {
  id: string;
  documentId: string;
  version: 1;
  correlationId: string;
  enqueuedAt: string;
  availableAt: string;
  attempts: number;
  fencingToken: number;
  leaseExpiresAt: string | null;
};

const enqueueScript = `
local existing = redis.call('HGET', KEYS[1], ARGV[1])
if existing then
  local jobKey = KEYS[4] .. existing
  return {0, redis.call('HMGET', jobKey, 'id', 'documentId', 'version', 'correlationId',
    'enqueuedAtMs', 'availableAtMs', 'attempts', 'fencingToken', 'leaseExpiresAtMs')}
end
local serverTime = redis.call('TIME')
local nowMs = (serverTime[1] * 1000) + math.floor(serverTime[2] / 1000)
local jobKey = KEYS[4] .. ARGV[2]
redis.call('HSET', jobKey,
  'id', ARGV[2],
  'companyId', ARGV[5],
  'documentId', ARGV[1],
  'version', '1',
  'correlationId', ARGV[3],
  'enqueuedAtMs', nowMs,
  'availableAtMs', nowMs,
  'attempts', '0',
  'fencingToken', '0',
  'state', 'QUEUED',
  'workerId', '',
  'leaseExpiresAtMs', '')
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('SADD', KEYS[2], ARGV[2])
redis.call('ZADD', KEYS[3], nowMs, ARGV[2])
return {1, redis.call('HMGET', jobKey, 'id', 'documentId', 'version', 'correlationId',
  'enqueuedAtMs', 'availableAtMs', 'attempts', 'fencingToken', 'leaseExpiresAtMs')}
`;

const claimScript = `
local serverTime = redis.call('TIME')
local nowMs = (serverTime[1] * 1000) + math.floor(serverTime[2] / 1000)
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', nowMs, 'LIMIT', 0, 1)
local jobId = expired[1]
if jobId then
  redis.call('ZREM', KEYS[2], jobId)
else
  local ready = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', nowMs, 'LIMIT', 0, 1)
  jobId = ready[1]
  if jobId then redis.call('ZREM', KEYS[1], jobId) end
end
if not jobId then return {} end
local jobKey = KEYS[3] .. jobId
if redis.call('EXISTS', jobKey) == 0 then
  redis.call('SREM', KEYS[4], jobId)
  return {}
end
local leaseExpiresAtMs = nowMs + tonumber(ARGV[2])
redis.call('HINCRBY', jobKey, 'attempts', 1)
redis.call('HINCRBY', jobKey, 'fencingToken', 1)
redis.call('HSET', jobKey, 'state', 'CLAIMED', 'workerId', ARGV[1],
  'leaseExpiresAtMs', leaseExpiresAtMs, 'heartbeatAtMs', nowMs)
redis.call('ZADD', KEYS[2], leaseExpiresAtMs, jobId)
return redis.call('HMGET', jobKey, 'id', 'documentId', 'version', 'correlationId',
  'enqueuedAtMs', 'availableAtMs', 'attempts', 'fencingToken', 'leaseExpiresAtMs')
`;

const renewScript = `
local serverTime = redis.call('TIME')
local nowMs = (serverTime[1] * 1000) + math.floor(serverTime[2] / 1000)
if redis.call('HGET', KEYS[1], 'state') ~= 'CLAIMED'
  or redis.call('HGET', KEYS[1], 'workerId') ~= ARGV[1]
  or redis.call('HGET', KEYS[1], 'fencingToken') ~= ARGV[2]
  or tonumber(redis.call('HGET', KEYS[1], 'leaseExpiresAtMs') or '0') <= nowMs then
  return redis.error_reply('STALE_LEASE')
end
local leaseExpiresAtMs = nowMs + tonumber(ARGV[3])
redis.call('HSET', KEYS[1], 'leaseExpiresAtMs', leaseExpiresAtMs, 'heartbeatAtMs', nowMs)
redis.call('ZADD', KEYS[2], leaseExpiresAtMs, ARGV[4])
return redis.call('HMGET', KEYS[1], 'id', 'documentId', 'version', 'correlationId',
  'enqueuedAtMs', 'availableAtMs', 'attempts', 'fencingToken', 'leaseExpiresAtMs')
`;

const assertLeaseScript = `
local serverTime = redis.call('TIME')
local nowMs = (serverTime[1] * 1000) + math.floor(serverTime[2] / 1000)
if redis.call('HGET', KEYS[1], 'state') ~= 'CLAIMED'
  or redis.call('HGET', KEYS[1], 'workerId') ~= ARGV[1]
  or redis.call('HGET', KEYS[1], 'fencingToken') ~= ARGV[2]
  or tonumber(redis.call('HGET', KEYS[1], 'leaseExpiresAtMs') or '0') <= nowMs then
  return redis.error_reply('STALE_LEASE')
end
return 1
`;

const acknowledgeScript = `
local serverTime = redis.call('TIME')
local nowMs = (serverTime[1] * 1000) + math.floor(serverTime[2] / 1000)
if redis.call('HGET', KEYS[1], 'state') ~= 'CLAIMED'
  or redis.call('HGET', KEYS[1], 'workerId') ~= ARGV[1]
  or redis.call('HGET', KEYS[1], 'fencingToken') ~= ARGV[2]
  or tonumber(redis.call('HGET', KEYS[1], 'leaseExpiresAtMs') or '0') <= nowMs then
  return redis.error_reply('STALE_LEASE')
end
local documentId = redis.call('HGET', KEYS[1], 'documentId')
redis.call('DEL', KEYS[1])
redis.call('HDEL', KEYS[2], documentId)
redis.call('SREM', KEYS[3], ARGV[3])
redis.call('ZREM', KEYS[4], ARGV[3])
redis.call('ZREM', KEYS[5], ARGV[3])
return 1
`;

const releaseScript = `
local serverTime = redis.call('TIME')
local nowMs = (serverTime[1] * 1000) + math.floor(serverTime[2] / 1000)
if redis.call('HGET', KEYS[1], 'state') ~= 'CLAIMED'
  or redis.call('HGET', KEYS[1], 'workerId') ~= ARGV[1]
  or redis.call('HGET', KEYS[1], 'fencingToken') ~= ARGV[2]
  or tonumber(redis.call('HGET', KEYS[1], 'leaseExpiresAtMs') or '0') <= nowMs then
  return redis.error_reply('STALE_LEASE')
end
local availableAtMs = tonumber(ARGV[3])
redis.call('HSET', KEYS[1], 'state', 'QUEUED', 'workerId', '', 'leaseExpiresAtMs', '',
  'heartbeatAtMs', '', 'availableAtMs', availableAtMs)
redis.call('ZREM', KEYS[2], ARGV[4])
redis.call('ZADD', KEYS[3], availableAtMs, ARGV[4])
return 1
`;

function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Redis queue returned an invalid response.');
  return value;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' && !Buffer.isBuffer(value)) {
    throw new Error(`Redis queue response is missing ${field}.`);
  }
  return String(value);
}

function asInteger(value: unknown, field: string): number {
  const parsed = Number(asString(value, field));
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Redis queue returned an invalid ${field}.`);
  }
  return parsed;
}

function isoFromMilliseconds(value: unknown, field: string): string {
  const milliseconds = asInteger(value, field);
  return new Date(milliseconds).toISOString();
}

function parseJob(value: unknown): RedisLeasedJob {
  const fields = asArray(value);
  if (fields.length !== 9) throw new Error('Redis queue returned an invalid job.');
  const version = asInteger(fields[2], 'version');
  if (version !== 1) throw new Error('Redis queue job version is unsupported.');
  const leaseValue =
    fields[8] === null || fields[8] === undefined || String(fields[8]) === '' ? null : fields[8];
  const job: RedisLeasedJob = {
    id: asString(fields[0], 'id'),
    documentId: asString(fields[1], 'documentId'),
    version,
    correlationId: asString(fields[3], 'correlationId'),
    enqueuedAt: isoFromMilliseconds(fields[4], 'enqueuedAt'),
    availableAt: isoFromMilliseconds(fields[5], 'availableAt'),
    attempts: asInteger(fields[6], 'attempts'),
    fencingToken: asInteger(fields[7], 'fencingToken'),
    leaseExpiresAt: leaseValue ? isoFromMilliseconds(leaseValue, 'leaseExpiresAt') : null,
  };
  assertSafeDocumentSegment(job.id, 'job id');
  assertSafeDocumentSegment(job.documentId, 'document id');
  assertSafeDocumentSegment(job.correlationId, 'correlationId');
  return job;
}

class RedisLeaseQueue {
  constructor(
    private readonly client: RedisCommandClient,
    private readonly queueName: string,
  ) {
    assertSafeDocumentSegment(queueName, 'queueName');
  }

  async enqueue(
    tenant: DocumentTenantContext,
    documentId: string,
  ): Promise<{ job: RedisLeasedJob; enqueued: boolean }> {
    assertDocumentTenantContext(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    const id = crypto.randomUUID();
    const correlationId = crypto.randomUUID();
    const keys = this.keys(tenant);
    const response = asArray(
      await this.eval(
        enqueueScript,
        [keys.documents, keys.jobs, keys.ready, keys.jobPrefix],
        [documentId, id, correlationId, '1', tenant.companyId],
      ),
    );
    return {
      enqueued: Number(response[0]) === 1,
      job: parseJob(response[1]),
    };
  }

  async claim(
    tenant: DocumentTenantContext,
    workerId: string,
    leaseDurationMs: number,
  ): Promise<RedisLeasedJob | null> {
    assertSafeDocumentSegment(workerId, 'workerId');
    this.assertLeaseDuration(leaseDurationMs);
    const keys = this.keys(tenant);
    const response = asArray(
      await this.eval(
        claimScript,
        [keys.ready, keys.leased, keys.jobPrefix, keys.jobs],
        [workerId, String(leaseDurationMs)],
      ),
    );
    return response.length === 0 ? null : parseJob(response);
  }

  async renew(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken: number,
    leaseDurationMs: number,
  ) {
    this.assertLease(jobId, workerId, fencingToken);
    this.assertLeaseDuration(leaseDurationMs);
    const keys = this.keys(tenant);
    return parseJob(
      await this.eval(
        renewScript,
        [keys.job(jobId), keys.leased],
        [workerId, String(fencingToken), String(leaseDurationMs), jobId],
      ),
    );
  }

  async assertOwnedLease(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken: number,
  ) {
    this.assertLease(jobId, workerId, fencingToken);
    const keys = this.keys(tenant);
    await this.eval(assertLeaseScript, [keys.job(jobId)], [workerId, String(fencingToken)]);
  }

  async acknowledge(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken: number,
  ) {
    this.assertLease(jobId, workerId, fencingToken);
    const keys = this.keys(tenant);
    await this.eval(
      acknowledgeScript,
      [keys.job(jobId), keys.documents, keys.jobs, keys.ready, keys.leased],
      [workerId, String(fencingToken), jobId],
    );
  }

  async release(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken: number,
    availableAt: string,
  ) {
    this.assertLease(jobId, workerId, fencingToken);
    const milliseconds = new Date(availableAt).getTime();
    if (!Number.isFinite(milliseconds)) throw new Error('availableAt must be a valid date.');
    const keys = this.keys(tenant);
    await this.eval(
      releaseScript,
      [keys.job(jobId), keys.leased, keys.ready],
      [workerId, String(fencingToken), String(milliseconds), jobId],
    );
  }

  async removeForDocument(tenant: DocumentTenantContext, documentId: string) {
    assertSafeDocumentSegment(documentId, 'document id');
    const keys = this.keys(tenant);
    const jobId = await this.client.sendCommand(['HGET', keys.documents, documentId]);
    if (jobId === null) return;
    const safeJobId = asString(jobId, 'job id');
    await this.client.sendCommand([
      'EVAL',
      `redis.call('HDEL', KEYS[1], ARGV[1]); redis.call('SREM', KEYS[2], ARGV[2]);
       redis.call('ZREM', KEYS[3], ARGV[2]); redis.call('ZREM', KEYS[4], ARGV[2]);
       redis.call('DEL', KEYS[5]); return 1`,
      '5',
      keys.documents,
      keys.jobs,
      keys.ready,
      keys.leased,
      keys.job(safeJobId),
      documentId,
      safeJobId,
    ]);
  }

  async list(tenant: DocumentTenantContext) {
    const keys = this.keys(tenant);
    const response = asArray(await this.client.sendCommand(['SMEMBERS', keys.jobs]));
    const jobs = await Promise.all(
      response.map(async (value) => {
        const jobId = asString(value, 'job id');
        const fields = await this.client.sendCommand([
          'HMGET',
          keys.job(jobId),
          'id',
          'documentId',
          'version',
          'correlationId',
          'enqueuedAtMs',
          'availableAtMs',
          'attempts',
          'fencingToken',
          'leaseExpiresAtMs',
        ]);
        return parseJob(fields);
      }),
    );
    return jobs.sort((first, second) => first.enqueuedAt.localeCompare(second.enqueuedAt));
  }

  async checkReadiness() {
    try {
      return String(await this.client.sendCommand(['PING'])) === 'PONG';
    } catch {
      return false;
    }
  }

  private keys(tenant: DocumentTenantContext) {
    assertDocumentTenantContext(tenant);
    const prefix = `avantime:{${this.queueName}:${tenant.companyId}}`;
    return {
      documents: `${prefix}:documents`,
      jobs: `${prefix}:jobs`,
      ready: `${prefix}:ready`,
      leased: `${prefix}:leased`,
      jobPrefix: `${prefix}:job:`,
      job: (jobId: string) => `${prefix}:job:${jobId}`,
    };
  }

  private eval(script: string, keys: string[], arguments_: string[]) {
    return this.client.sendCommand(['EVAL', script, String(keys.length), ...keys, ...arguments_]);
  }

  private assertLease(jobId: string, workerId: string, fencingToken: number) {
    assertSafeDocumentSegment(jobId, 'job id');
    assertSafeDocumentSegment(workerId, 'workerId');
    if (!Number.isSafeInteger(fencingToken) || fencingToken <= 0) {
      throw new Error('fencingToken must be a positive safe integer.');
    }
  }

  private assertLeaseDuration(value: number) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error('Queue lease duration must be a positive safe integer.');
    }
  }
}

export class RedisDocumentProcessingQueue implements ExternalDocumentProcessingQueue {
  readonly kind = 'external';

  private readonly queue: RedisLeaseQueue;

  constructor(
    client: RedisCommandClient,
    readonly queueName = 'document-processing',
  ) {
    this.queue = new RedisLeaseQueue(client, queueName);
  }

  async enqueue(tenant: DocumentTenantContext, documentId: string): Promise<DocumentEnqueueResult> {
    return this.queue.enqueue(tenant, documentId) as Promise<DocumentEnqueueResult>;
  }

  async claim(
    tenant: DocumentTenantContext,
    workerId: string,
    options: { leaseDurationMs?: number } = {},
  ): Promise<DocumentProcessingJob | null> {
    return this.queue.claim(tenant, workerId, options.leaseDurationMs ?? 300_000);
  }

  renew(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken: number,
    leaseDurationMs: number,
  ) {
    return this.queue.renew(tenant, jobId, workerId, fencingToken, leaseDurationMs);
  }
  assertLease(tenant: DocumentTenantContext, jobId: string, workerId: string, fencingToken = 0) {
    return this.queue.assertOwnedLease(tenant, jobId, workerId, fencingToken);
  }
  acknowledge(tenant: DocumentTenantContext, jobId: string, workerId: string, fencingToken = 0) {
    return this.queue.acknowledge(tenant, jobId, workerId, fencingToken);
  }
  release(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    availableAt: string,
    fencingToken = 0,
  ) {
    return this.queue.release(tenant, jobId, workerId, fencingToken, availableAt);
  }
  removeForDocument(tenant: DocumentTenantContext, documentId: string) {
    return this.queue.removeForDocument(tenant, documentId);
  }
  list(tenant: DocumentTenantContext) {
    return this.queue.list(tenant);
  }
}

export class RedisEmbeddingJobQueue implements EmbeddingJobQueue {
  readonly kind = 'external';

  private readonly queue: RedisLeaseQueue;

  constructor(
    client: RedisCommandClient,
    readonly queueName = 'document-embedding',
  ) {
    this.queue = new RedisLeaseQueue(client, queueName);
  }

  async enqueue(
    tenant: DocumentTenantContext,
    documentId: string,
  ): Promise<EmbeddingEnqueueResult> {
    return this.queue.enqueue(tenant, documentId) as Promise<EmbeddingEnqueueResult>;
  }

  async claim(
    tenant: DocumentTenantContext,
    workerId: string,
    options: { leaseDurationMs?: number } = {},
  ): Promise<EmbeddingJob | null> {
    return this.queue.claim(tenant, workerId, options.leaseDurationMs ?? 300_000);
  }

  renew(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken: number,
    leaseDurationMs: number,
  ) {
    return this.queue.renew(tenant, jobId, workerId, fencingToken, leaseDurationMs);
  }
  assertLease(tenant: DocumentTenantContext, jobId: string, workerId: string, fencingToken = 0) {
    return this.queue.assertOwnedLease(tenant, jobId, workerId, fencingToken);
  }
  acknowledge(tenant: DocumentTenantContext, jobId: string, workerId: string, fencingToken = 0) {
    return this.queue.acknowledge(tenant, jobId, workerId, fencingToken);
  }
  release(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    availableAt: string,
    fencingToken = 0,
  ) {
    return this.queue.release(tenant, jobId, workerId, fencingToken, availableAt);
  }
  removeForDocument(tenant: DocumentTenantContext, documentId: string) {
    return this.queue.removeForDocument(tenant, documentId);
  }
  list(tenant: DocumentTenantContext) {
    return this.queue.list(tenant);
  }
  checkReadiness() {
    return this.queue.checkReadiness();
  }
}
