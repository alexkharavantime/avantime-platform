import { getPrisma } from '@avantime/database';

import { processNotificationBatch } from './notification-outbox';
import { createNotificationProvider } from './notification-providers';
import { loadStagingConfiguration } from './staging-configuration';

const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,99}$/u;

export async function runNotificationWorker(input: {
  once?: boolean;
  signal?: AbortSignal;
  environment?: NodeJS.ProcessEnv;
}) {
  const environment = input.environment ?? process.env;
  const staging = loadStagingConfiguration(environment);
  const provider = createNotificationProvider(environment);
  const workerId = environment.NOTIFICATION_WORKER_ID?.trim() ?? '';
  if (!SAFE_REFERENCE.test(workerId)) throw new Error('NOTIFICATION_WORKER_ID_INVALID');
  const prisma = await getPrisma();
  if (!prisma) throw new Error('NOTIFICATION_DATABASE_UNAVAILABLE');
  const startedAt = new Date();
  let totals = { claimed: 0, delivered: 0, failed: 0, deadLettered: 0 };
  do {
    if (input.signal?.aborted) break;
    let lastErrorCode: string | null = null;
    let batch = { claimed: 0, delivered: 0, failed: 0, deadLettered: 0 };
    try {
      batch = await processNotificationBatch({
        provider,
        batchSize: staging.notifications.batchSize,
        leaseMs: staging.notifications.leaseMs,
      });
      totals = {
        claimed: totals.claimed + batch.claimed,
        delivered: totals.delivered + batch.delivered,
        failed: totals.failed + batch.failed,
        deadLettered: totals.deadLettered + batch.deadLettered,
      };
    } catch {
      lastErrorCode = 'NOTIFICATION_BATCH_FAILED';
    }
    await prisma.notificationWorkerHeartbeat.upsert({
      where: { workerId },
      create: {
        workerId,
        workerVersion: staging.versions.application,
        deploymentGeneration: staging.versions.deploymentGeneration,
        status: lastErrorCode ? 'degraded' : 'ready',
        lastBatchSize: batch.claimed,
        lastErrorCode,
        startedAt,
      },
      update: {
        workerVersion: staging.versions.application,
        deploymentGeneration: staging.versions.deploymentGeneration,
        status: lastErrorCode ? 'degraded' : 'ready',
        lastBatchSize: batch.claimed,
        lastErrorCode,
        heartbeatAt: new Date(),
      },
    });
    console.info(
      JSON.stringify({
        event: 'notification-worker-batch',
        workerId,
        ...batch,
        status: lastErrorCode ? 'degraded' : 'ready',
      }),
    );
    if (input.once) break;
    await waitForNextPoll(1_000, input.signal);
  } while (!input.signal?.aborted);
  return totals;
}

function waitForNextPoll(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timeout = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}
