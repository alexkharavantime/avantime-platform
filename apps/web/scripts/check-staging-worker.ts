import { getPrisma } from '@avantime/database';

import { createRedisCommandClient } from '../lib/redis-lease-queue';
import { loadStagingConfiguration } from '../lib/staging-configuration';
import {
  inspectCriticalStagingWorkerHeartbeat,
  type CriticalStagingWorker,
} from '../lib/staging-worker-heartbeat';

async function main() {
  const worker = process.argv[2];
  if (
    worker !== 'notification' &&
    worker !== 'knowledge' &&
    worker !== 'jira' &&
    worker !== 'jira-inbound' &&
    worker !== 'document' &&
    worker !== 'embedding'
  ) {
    throw new Error('WORKER_KIND_INVALID');
  }
  const configuration = loadStagingConfiguration();
  if (worker === 'document' || worker === 'embedding') {
    const client = await createRedisCommandClient(configuration.redis.url.toString(), {
      connectTimeoutMs: configuration.redis.connectTimeoutMs,
    });
    try {
      const heartbeat = await inspectCriticalStagingWorkerHeartbeat({
        client,
        configuration,
        worker: worker as CriticalStagingWorker,
      });
      if (!heartbeat.ready) throw new Error(heartbeat.code);
      console.info(JSON.stringify({ status: 'passed', worker }));
      return;
    } finally {
      await client.close?.();
    }
  }
  const prisma = await getPrisma();
  if (!prisma) throw new Error('WORKER_HEALTH_DATABASE_UNAVAILABLE');
  const heartbeat =
    worker === 'notification'
      ? await prisma.notificationWorkerHeartbeat.findFirst({ orderBy: { heartbeatAt: 'desc' } })
      : worker === 'knowledge'
        ? await prisma.knowledgeIndexWorkerHeartbeat.findFirst({ orderBy: { heartbeatAt: 'desc' } })
        : worker === 'jira'
          ? await prisma.jiraWorkerHeartbeat.findFirst({ orderBy: { heartbeatAt: 'desc' } })
          : await prisma.jiraInboundWorkerHeartbeat.findFirst({ orderBy: { heartbeatAt: 'desc' } });
  if (
    !heartbeat ||
    Date.now() - heartbeat.heartbeatAt.getTime() > 120_000 ||
    heartbeat.deploymentGeneration !== configuration.versions.deploymentGeneration
  ) {
    throw new Error('WORKER_HEARTBEAT_STALE');
  }
  console.info(
    JSON.stringify({
      status: 'passed',
      worker,
      heartbeat: heartbeat.heartbeatAt.toISOString(),
      workerVersion: heartbeat.workerVersion,
      deploymentGeneration: heartbeat.deploymentGeneration,
    }),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      code: error instanceof Error ? error.message : 'WORKER_HEALTH_FAILED',
    }),
  );
  process.exitCode = 1;
});
