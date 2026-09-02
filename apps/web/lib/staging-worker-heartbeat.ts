import { createRedisCommandClient, type RedisCommandClient } from './redis-lease-queue';
import { loadStagingConfiguration, type StagingConfiguration } from './staging-configuration';
import { stagingRedisKey } from './staging-redis';

export type CriticalStagingWorker = 'document' | 'embedding';

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_MAXIMUM_AGE_MS = 120_000;
const HEARTBEAT_TTL_SECONDS = 180;
const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,199}$/u;

type WorkerHeartbeat = {
  schemaVersion: 1;
  worker: CriticalStagingWorker;
  workerVersion: string;
  deploymentGeneration: string;
  heartbeatAt: string;
};

function heartbeatKey(namespace: string, worker: CriticalStagingWorker) {
  return stagingRedisKey({
    namespace,
    area: 'worker',
    tenantId: 'system',
    resource: `${worker}-runtime`,
  });
}

export async function publishCriticalStagingWorkerHeartbeat(input: {
  client: RedisCommandClient;
  configuration: StagingConfiguration;
  worker: CriticalStagingWorker;
  workerVersion: string;
  now?: Date;
}) {
  if (!SAFE_REFERENCE.test(input.workerVersion)) {
    throw new Error('STAGING_WORKER_VERSION_INVALID');
  }
  const heartbeat: WorkerHeartbeat = {
    schemaVersion: 1,
    worker: input.worker,
    workerVersion: input.workerVersion,
    deploymentGeneration: input.configuration.versions.deploymentGeneration,
    heartbeatAt: (input.now ?? new Date()).toISOString(),
  };
  const result = await input.client.sendCommand([
    'SET',
    heartbeatKey(input.configuration.redis.namespace, input.worker),
    JSON.stringify(heartbeat),
    'EX',
    String(HEARTBEAT_TTL_SECONDS),
  ]);
  if (String(result) !== 'OK') throw new Error('STAGING_WORKER_HEARTBEAT_WRITE_FAILED');
  return heartbeat;
}

export async function inspectCriticalStagingWorkerHeartbeat(input: {
  client: RedisCommandClient;
  configuration: StagingConfiguration;
  worker: CriticalStagingWorker;
  now?: Date;
}) {
  const raw = await input.client.sendCommand([
    'GET',
    heartbeatKey(input.configuration.redis.namespace, input.worker),
  ]);
  if (typeof raw !== 'string') {
    return { ready: false as const, code: 'STAGING_WORKER_HEARTBEAT_MISSING' as const };
  }
  try {
    const heartbeat = JSON.parse(raw) as Partial<WorkerHeartbeat>;
    const heartbeatAt = new Date(String(heartbeat.heartbeatAt ?? ''));
    const now = input.now ?? new Date();
    const ageMs = now.getTime() - heartbeatAt.getTime();
    const ready =
      heartbeat.schemaVersion === 1 &&
      heartbeat.worker === input.worker &&
      heartbeat.workerVersion === input.configuration.versions.application &&
      heartbeat.deploymentGeneration === input.configuration.versions.deploymentGeneration &&
      Number.isFinite(heartbeatAt.getTime()) &&
      ageMs >= -30_000 &&
      ageMs <= HEARTBEAT_MAXIMUM_AGE_MS;
    return {
      ready,
      code: ready
        ? ('STAGING_WORKER_HEARTBEAT_READY' as const)
        : ('STAGING_WORKER_HEARTBEAT_STALE' as const),
    };
  } catch {
    return { ready: false as const, code: 'STAGING_WORKER_HEARTBEAT_INVALID' as const };
  }
}

export async function startCriticalStagingWorkerHeartbeat(input: {
  worker: CriticalStagingWorker;
  environment?: NodeJS.ProcessEnv;
}) {
  const environment = input.environment ?? process.env;
  if (environment.APP_ENV !== 'staging') return null;
  const configuration = loadStagingConfiguration(environment);
  const client = await createRedisCommandClient(configuration.redis.url.toString(), {
    connectTimeoutMs: configuration.redis.connectTimeoutMs,
  });
  const workerVersion = environment.WORKER_VERSION?.trim() || configuration.versions.application;
  await publishCriticalStagingWorkerHeartbeat({
    client,
    configuration,
    worker: input.worker,
    workerVersion,
  });
  let pending = Promise.resolve();
  const timer = setInterval(() => {
    pending = pending
      .then(async () => {
        await publishCriticalStagingWorkerHeartbeat({
          client,
          configuration,
          worker: input.worker,
          workerVersion,
        });
      })
      .catch(() => undefined);
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return {
    async stop() {
      clearInterval(timer);
      await pending.catch(() => undefined);
      await client.close?.();
    },
  };
}
