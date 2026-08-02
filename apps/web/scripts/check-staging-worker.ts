import { getPrisma } from '@avantime/database';

import { loadStagingConfiguration } from '../lib/staging-configuration';

async function main() {
  const worker = process.argv[2];
  if (worker !== 'notification' && worker !== 'knowledge' && worker !== 'jira') {
    throw new Error('WORKER_KIND_INVALID');
  }
  const configuration = loadStagingConfiguration();
  const prisma = await getPrisma();
  if (!prisma) throw new Error('WORKER_HEALTH_DATABASE_UNAVAILABLE');
  const heartbeat =
    worker === 'notification'
      ? await prisma.notificationWorkerHeartbeat.findFirst({ orderBy: { heartbeatAt: 'desc' } })
      : worker === 'knowledge'
        ? await prisma.knowledgeIndexWorkerHeartbeat.findFirst({ orderBy: { heartbeatAt: 'desc' } })
        : await prisma.jiraWorkerHeartbeat.findFirst({ orderBy: { heartbeatAt: 'desc' } });
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
