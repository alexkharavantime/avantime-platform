import { getPrisma } from '@avantime/database';

import { summarizeWorkerHeartbeats, type WorkerHeartbeatRow } from '../lib/worker-lease';

const maximumAgeMs = Number(process.env.WORKER_HEARTBEAT_MAXIMUM_AGE_MS || 600_000);

async function main() {
  try {
    if (!Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0) {
      throw new Error('WORKER_HEARTBEAT_MAXIMUM_AGE_MS must be a positive integer.');
    }
    const database = (await getPrisma()) as {
      $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
    } | null;
    if (!database) throw new Error('Worker heartbeat database is unavailable.');
    const rows = await database.$queryRawUnsafe<WorkerHeartbeatRow[]>(
      `SELECT 'document' AS "component",
       MAX(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "workerHeartbeatAt")) * 1000)
         FILTER (WHERE "status" = 'PROCESSING') AS "heartbeatAgeMs",
       COUNT(*) FILTER (WHERE "status" = 'PROCESSING') AS "activeJobs",
       COUNT(*) FILTER (
         WHERE "status" = 'PROCESSING'
           AND (
             "workerHeartbeatAt" IS NULL
             OR "workerHeartbeatAt" < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
           )
       ) AS "staleJobs"
     FROM "DocumentMetadata"
     UNION ALL
     SELECT 'embedding' AS "component",
       MAX(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "heartbeatAt")) * 1000)
         FILTER (WHERE "status" = 'PROCESSING') AS "heartbeatAgeMs",
       COUNT(*) FILTER (WHERE "status" = 'PROCESSING') AS "activeJobs",
       COUNT(*) FILTER (
         WHERE "status" = 'PROCESSING'
           AND (
             "heartbeatAt" IS NULL
             OR "heartbeatAt" < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
           )
       ) AS "staleJobs"
     FROM "DocumentEmbeddingJob"`,
      maximumAgeMs,
    );
    const components = summarizeWorkerHeartbeats(rows);
    const ready = Object.values(components).every((component) => component.status === 'ready');
    console.log(JSON.stringify({ status: ready ? 'ready' : 'unavailable', components }));
    if (!ready) process.exitCode = 1;
  } catch {
    console.error(
      JSON.stringify({ status: 'unavailable', errorCode: 'WORKER_HEARTBEAT_UNAVAILABLE' }),
    );
    process.exitCode = 1;
  }
}

void main();
