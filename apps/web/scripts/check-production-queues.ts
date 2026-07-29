import { createRedisCommandClient, type RedisCommandClient } from '../lib/redis-lease-queue';

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Redis queue health response is invalid.');
  return value.map((item) => String(item));
}

async function queueSnapshot(client: RedisCommandClient, queueName: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(queueName)) {
    throw new Error('Queue name is invalid.');
  }
  let cursor = '0';
  const jobSets: string[] = [];
  do {
    const response = await client.sendCommand([
      'SCAN',
      cursor,
      'MATCH',
      `avantime:{${queueName}:*}:jobs`,
      'COUNT',
      '100',
    ]);
    if (!Array.isArray(response) || response.length !== 2) {
      throw new Error('Redis queue scan response is invalid.');
    }
    cursor = String(response[0]);
    jobSets.push(...asStrings(response[1]));
  } while (cursor !== '0');

  let depth = 0;
  let oldestEnqueuedAtMs: number | null = null;
  for (const jobSet of jobSets) {
    const jobIds = asStrings(await client.sendCommand(['SMEMBERS', jobSet]));
    depth += jobIds.length;
    if (depth > 10_000) throw new Error('Queue health scan safety limit exceeded.');
    const prefix = jobSet.slice(0, -':jobs'.length);
    for (const jobId of jobIds) {
      const value = await client.sendCommand(['HGET', `${prefix}:job:${jobId}`, 'enqueuedAtMs']);
      if (value === null) continue;
      const parsed = Number(String(value));
      if (Number.isFinite(parsed)) {
        oldestEnqueuedAtMs =
          oldestEnqueuedAtMs === null ? parsed : Math.min(oldestEnqueuedAtMs, parsed);
      }
    }
  }
  const time = asStrings(await client.sendCommand(['TIME']));
  const nowMs = Number(time[0]) * 1_000 + Math.floor(Number(time[1]) / 1_000);
  return {
    depth,
    oldestJobAgeMs: oldestEnqueuedAtMs === null ? null : Math.max(0, nowMs - oldestEnqueuedAtMs),
  };
}

async function main() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    console.error(
      JSON.stringify({ status: 'unavailable', errorCode: 'REDIS_CONFIGURATION_MISSING' }),
    );
    process.exitCode = 1;
    return;
  }
  let client: Awaited<ReturnType<typeof createRedisCommandClient>> | undefined;
  try {
    client = await createRedisCommandClient(redisUrl);
    const [document, embedding] = await Promise.all([
      queueSnapshot(client, process.env.DOCUMENT_PROCESSING_QUEUE_NAME || 'document-processing'),
      queueSnapshot(client, 'document-embedding'),
    ]);
    console.log(
      JSON.stringify({
        status: 'ready',
        components: {
          redis: 'ready',
          documentQueue: 'ready',
          embeddingQueue: 'ready',
        },
        queues: { document, embedding },
      }),
    );
  } catch {
    console.error(
      JSON.stringify({ status: 'unavailable', errorCode: 'QUEUE_COORDINATION_UNAVAILABLE' }),
    );
    process.exitCode = 1;
  } finally {
    await client?.close?.();
  }
}

void main();
