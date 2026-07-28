import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadDocumentConfiguration } from '../lib/document-configuration';
import { checkDocumentReadiness } from '../lib/document-health';
import { createDocumentServices } from '../lib/document-services';
import { DocumentWorkerShutdown, runDocumentWorkerLoop } from '../lib/document-worker-runtime';
import { assertSafeDocumentIntegrationEnvironment } from '../scripts/document-integration-environment';

test('document readiness reports only component states', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'avantime-health-'));
  try {
    const configuration = loadDocumentConfiguration({
      NODE_ENV: 'test',
      DOCUMENT_DATA_DIR: dataDirectory,
    });
    const services = createDocumentServices(configuration);
    const readiness = await checkDocumentReadiness({
      loadConfiguration: () => configuration,
      loadWorkerConfiguration: () => ({
        tenantId: 'health-tenant',
        workerId: 'health-worker',
      }),
      loadServices: () => services,
    });

    assert.deepEqual(readiness, {
      status: 'ready',
      components: {
        configuration: 'ready',
        worker: 'ready',
        metadata: 'ready',
        storage: 'ready',
        queue: 'ready',
      },
    });
    assert.equal(JSON.stringify(readiness).includes(dataDirectory), false);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('document readiness is deny-by-default when configuration is invalid', async () => {
  const readiness = await checkDocumentReadiness({
    loadConfiguration: () => {
      throw new Error('postgresql://user:secret@production.example/database');
    },
  });

  assert.equal(readiness.status, 'unavailable');
  assert.deepEqual(readiness.components, {
    configuration: 'unavailable',
    worker: 'unavailable',
    metadata: 'unavailable',
    storage: 'unavailable',
    queue: 'unavailable',
  });
  assert.equal(JSON.stringify(readiness).includes('secret'), false);
});

test('document health route keeps detailed diagnostics behind ADMIN authorization', async () => {
  const route = await readFile(
    path.join(process.cwd(), 'app', 'api', 'health', 'documents', 'route.ts'),
    'utf8',
  );

  assert.match(route, /mode === 'liveness'/);
  assert.match(route, /authorizeDocumentApi/);
  assert.match(route, /details/);
  assert.doesNotMatch(
    route,
    /OBJECT_STORAGE_BUCKET|OBJECT_STORAGE_SECRET_KEY|DATABASE_URL|connection string/i,
  );
});

test('graceful worker shutdown finishes the current job and does not claim another', async () => {
  const shutdown = new DocumentWorkerShutdown();
  let finishJob!: () => void;
  let calls = 0;
  const currentJob = new Promise<void>((resolve) => {
    finishJob = resolve;
  });
  const outcomes: string[] = [];
  const loop = runDocumentWorkerLoop({
    worker: {
      runOnce: async () => {
        calls += 1;
        await currentJob;
        return {
          outcome: 'COMPLETED',
          documentId: 'integration-document',
          jobId: 'integration-job',
        };
      },
    },
    tenant: {
      companyId: 'integration-tenant',
      userId: 'document-worker',
    },
    workerId: 'integration-worker',
    pollIntervalMs: 10_000,
    shutdown,
    onResult: (result) => {
      outcomes.push(result.outcome);
    },
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  shutdown.request();
  assert.equal(calls, 1);
  finishJob();
  await loop;

  assert.equal(calls, 1);
  assert.deepEqual(outcomes, ['COMPLETED']);
});

test('graceful worker shutdown interrupts an idle poll wait', async () => {
  const shutdown = new DocumentWorkerShutdown();
  const loop = runDocumentWorkerLoop({
    worker: {
      runOnce: async () => ({
        outcome: 'IDLE',
      }),
    },
    tenant: {
      companyId: 'integration-tenant',
      userId: 'document-worker',
    },
    workerId: 'integration-worker',
    pollIntervalMs: 60_000,
    shutdown,
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  shutdown.request();
  await loop;
  assert.equal(shutdown.isRequested, true);
});

test('worker entrypoint maps SIGINT and SIGTERM to graceful shutdown', async () => {
  const workerEntrypoint = await readFile(
    path.join(process.cwd(), 'scripts', 'run-document-worker.ts'),
    'utf8',
  );

  assert.match(workerEntrypoint, /process\.once\('SIGINT', stop\)/);
  assert.match(workerEntrypoint, /process\.once\('SIGTERM', stop\)/);
  assert.match(workerEntrypoint, /shutdown\.request\(\)/);
  assert.match(workerEntrypoint, /process\.removeListener\('SIGINT', stop\)/);
  assert.match(workerEntrypoint, /process\.removeListener\('SIGTERM', stop\)/);
});

test('integration operations reject production and non-local targets', () => {
  const safeEnvironment = {
    NODE_ENV: 'test',
    RUN_DOCUMENT_INTEGRATION_TESTS: '1',
    DATABASE_URL: 'postgresql://avantime_test:test@127.0.0.1:55432/avantime_integration',
    OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:59000',
    OBJECT_STORAGE_BUCKET: 'avantime-documents-integration',
    DOCUMENT_STORAGE_DRIVER: 's3',
    DOCUMENT_METADATA_DRIVER: 'postgresql',
    DOCUMENT_PROCESSING_QUEUE_DRIVER: 'local',
  };
  assert.doesNotThrow(() => assertSafeDocumentIntegrationEnvironment(safeEnvironment));
  assert.throws(
    () =>
      assertSafeDocumentIntegrationEnvironment({
        ...safeEnvironment,
        NODE_ENV: 'production',
      }),
    /forbidden/i,
  );
  assert.throws(
    () =>
      assertSafeDocumentIntegrationEnvironment({
        ...safeEnvironment,
        DATABASE_URL: 'postgresql://user:secret@database.example/avantime_production',
      }),
    /local integration service/i,
  );
  assert.throws(
    () =>
      assertSafeDocumentIntegrationEnvironment({
        ...safeEnvironment,
        OBJECT_STORAGE_BUCKET: 'production-documents',
      }),
    /bucket name/i,
  );
});
