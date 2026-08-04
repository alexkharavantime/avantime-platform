import { getPrisma } from '@avantime/database';

import { deleteExpiredJiraInboundEvents, processJiraInboundBatch } from './jira-inbound';
import { loadJiraWebhookConfiguration } from './jira-webhook-configuration';

const SAFE_WORKER_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,99}$/u;
const RETENTION_INTERVAL_MS = 6 * 60 * 60_000;

export async function runJiraInboundWorker(input: {
  once?: boolean;
  signal?: AbortSignal;
  environment?: NodeJS.ProcessEnv;
}) {
  const environment = input.environment ?? process.env;
  const configuration = loadJiraWebhookConfiguration(environment);
  const workerId = environment.JIRA_INBOUND_WORKER_ID?.trim() ?? '';
  if (!SAFE_WORKER_ID.test(workerId)) throw new Error('JIRA_INBOUND_WORKER_ID_INVALID');
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_INBOUND_DATABASE_UNAVAILABLE');
  const startedAt = new Date();
  let nextRetentionAt = 0;
  let totals = { claimed: 0, completed: 0, ignored: 0, failed: 0, deadLettered: 0 };
  do {
    if (input.signal?.aborted) break;
    let lastErrorCode: string | null = null;
    let batch = { claimed: 0, completed: 0, ignored: 0, failed: 0, deadLettered: 0 };
    try {
      if (configuration.enabled) {
        if (Date.now() >= nextRetentionAt) {
          await deleteExpiredJiraInboundEvents(configuration.retentionDays);
          nextRetentionAt = Date.now() + RETENTION_INTERVAL_MS;
        }
        batch = await processJiraInboundBatch({
          batchSize: configuration.batchSize,
          leaseMs: configuration.leaseMs,
        });
      }
      totals = {
        claimed: totals.claimed + batch.claimed,
        completed: totals.completed + batch.completed,
        ignored: totals.ignored + batch.ignored,
        failed: totals.failed + batch.failed,
        deadLettered: totals.deadLettered + batch.deadLettered,
      };
    } catch {
      lastErrorCode = 'JIRA_INBOUND_BATCH_FAILED';
    }
    await prisma.jiraInboundWorkerHeartbeat.upsert({
      where: { workerId },
      create: {
        workerId,
        workerVersion: environment.APP_VERSION ?? 'development',
        deploymentGeneration: environment.DEPLOYMENT_GENERATION ?? 'development',
        status: lastErrorCode ? 'degraded' : configuration.enabled ? 'ready' : 'disabled',
        lastBatchSize: batch.claimed,
        lastErrorCode,
        startedAt,
      },
      update: {
        workerVersion: environment.APP_VERSION ?? 'development',
        deploymentGeneration: environment.DEPLOYMENT_GENERATION ?? 'development',
        status: lastErrorCode ? 'degraded' : configuration.enabled ? 'ready' : 'disabled',
        lastBatchSize: batch.claimed,
        lastErrorCode,
        heartbeatAt: new Date(),
      },
    });
    console.info(
      JSON.stringify({
        event: 'jira-inbound-worker-batch',
        workerId,
        mode: configuration.mode,
        ...batch,
        status: lastErrorCode ? 'degraded' : configuration.enabled ? 'ready' : 'disabled',
      }),
    );
    if (input.once) break;
    await waitForNextPoll(configuration.pollIntervalMs, input.signal);
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
