import { getPrisma } from '@avantime/database';

import { createJiraProvider } from './jira';
import { loadJiraConfiguration } from './jira-configuration';
import { processJiraOperationBatch } from './jira-outbox';

const SAFE_WORKER_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,99}$/u;

export async function runJiraWorker(input: {
  once?: boolean;
  signal?: AbortSignal;
  environment?: NodeJS.ProcessEnv;
}) {
  const environment = input.environment ?? process.env;
  const configuration = loadJiraConfiguration(environment);
  const provider = createJiraProvider(environment);
  const workerId = environment.JIRA_WORKER_ID?.trim() ?? '';
  if (!SAFE_WORKER_ID.test(workerId)) throw new Error('JIRA_WORKER_ID_INVALID');
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_DATABASE_UNAVAILABLE');
  const startedAt = new Date();
  let totals = { claimed: 0, completed: 0, failed: 0, deadLettered: 0 };
  do {
    if (input.signal?.aborted) break;
    let lastErrorCode: string | null = null;
    let batch = { claimed: 0, completed: 0, failed: 0, deadLettered: 0 };
    try {
      if (configuration.enabled) {
        batch = await processJiraOperationBatch({
          provider,
          batchSize: configuration.batchSize,
          leaseMs: configuration.leaseMs,
        });
      }
      totals = {
        claimed: totals.claimed + batch.claimed,
        completed: totals.completed + batch.completed,
        failed: totals.failed + batch.failed,
        deadLettered: totals.deadLettered + batch.deadLettered,
      };
    } catch {
      lastErrorCode = 'JIRA_BATCH_FAILED';
    }
    await prisma.jiraWorkerHeartbeat.upsert({
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
        event: 'jira-worker-batch',
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
