import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadDocumentConfiguration } from '../lib/document-configuration';
import { checkDocumentReadiness } from '../lib/document-health';
import type { DocumentOcrAvailability } from '../lib/document-ocr';
import { createDocumentServices } from '../lib/document-services';
import { DocumentWorkerShutdown, runDocumentWorkerLoop } from '../lib/document-worker-runtime';
import { assertSafeDocumentIntegrationEnvironment } from '../scripts/document-integration-environment';

async function createHealthFixture(
  environment: Record<string, string | undefined>,
  availability?: DocumentOcrAvailability,
) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'avantime-health-'));
  const configuration = loadDocumentConfiguration({
    NODE_ENV: 'test',
    DOCUMENT_DATA_DIR: dataDirectory,
    ...environment,
  });
  const services = createDocumentServices(configuration);
  if (availability) {
    services.ocr = {
      checkAvailability: async () => availability,
      recognize: async () => ({
        text: '',
        pageCount: 1,
        language: 'eng',
        provider: 'fake',
      }),
    };
  }

  return {
    dataDirectory,
    configuration,
    services,
    check: () =>
      checkDocumentReadiness({
        loadConfiguration: () => configuration,
        loadWorkerConfiguration: () => ({
          tenantId: 'health-tenant',
          workerId: 'health-worker',
        }),
        loadServices: () => services,
      }),
    cleanup: () => rm(dataDirectory, { recursive: true, force: true }),
  };
}

test('document readiness reports separate core and document intelligence states', async () => {
  const fixture = await createHealthFixture(
    {
      DOCUMENT_OCR_DRIVER: 'local',
      DOCUMENT_OCR_LANGUAGES: 'eng',
      DOCUMENT_OCR_REQUIRED_FOR_READINESS: 'true',
    },
    {
      available: true,
      languages: ['eng'],
      pdfSupported: true,
    },
  );
  try {
    const readiness = await fixture.check();

    assert.deepEqual(readiness, {
      status: 'ready',
      components: {
        core: {
          status: 'ready',
          configuration: 'ready',
          worker: 'ready',
          metadata: 'ready',
          storage: 'ready',
          queue: 'ready',
        },
        documentIntelligence: {
          status: 'ready',
          requiredForReadiness: true,
          textQuality: 'ready',
          typeDetection: 'ready',
          ocr: {
            status: 'ready',
            runtime: 'ready',
            languages: 'ready',
            pdfSupport: 'ready',
          },
        },
      },
    });
    assert.equal(JSON.stringify(readiness).includes(fixture.dataDirectory), false);
  } finally {
    await fixture.cleanup();
  }
});

test('OCR disabled with ready persistence keeps core document processing ready', async () => {
  const fixture = await createHealthFixture({
    DOCUMENT_OCR_DRIVER: 'disabled',
  });
  try {
    const readiness = await fixture.check();
    assert.equal(readiness.status, 'ready');
    assert.equal(readiness.components.core.status, 'ready');
    assert.equal(readiness.components.documentIntelligence.status, 'disabled');
    assert.equal(readiness.components.documentIntelligence.ocr.status, 'disabled');
  } finally {
    await fixture.cleanup();
  }
});

test('configured OCR reports unavailable when its runtime is missing', async () => {
  const fixture = await createHealthFixture(
    {
      DOCUMENT_OCR_DRIVER: 'local',
      DOCUMENT_OCR_LANGUAGES: 'eng',
    },
    {
      available: false,
      languages: [],
      pdfSupported: false,
    },
  );
  try {
    const readiness = await fixture.check();
    assert.equal(readiness.components.documentIntelligence.status, 'unavailable');
    assert.deepEqual(readiness.components.documentIntelligence.ocr, {
      status: 'unavailable',
      runtime: 'unavailable',
      languages: 'unavailable',
      pdfSupport: 'unavailable',
    });
  } finally {
    await fixture.cleanup();
  }
});

test('configured OCR reports unavailable when Poppler PDF support is missing', async () => {
  const fixture = await createHealthFixture(
    {
      DOCUMENT_OCR_DRIVER: 'local',
      DOCUMENT_OCR_LANGUAGES: 'eng',
    },
    {
      available: true,
      runtimeAvailable: true,
      languages: ['eng'],
      pdfSupported: false,
    },
  );
  try {
    const readiness = await fixture.check();
    assert.equal(readiness.components.documentIntelligence.ocr.runtime, 'ready');
    assert.equal(readiness.components.documentIntelligence.ocr.languages, 'ready');
    assert.equal(readiness.components.documentIntelligence.ocr.pdfSupport, 'unavailable');
    assert.equal(readiness.components.documentIntelligence.ocr.status, 'unavailable');
  } finally {
    await fixture.cleanup();
  }
});

test('required OCR makes overall document readiness unavailable', async () => {
  const fixture = await createHealthFixture(
    {
      DOCUMENT_OCR_DRIVER: 'local',
      DOCUMENT_OCR_LANGUAGES: 'eng',
      DOCUMENT_OCR_REQUIRED_FOR_READINESS: 'true',
    },
    {
      available: false,
      languages: [],
      pdfSupported: false,
    },
  );
  try {
    const readiness = await fixture.check();
    assert.equal(readiness.components.core.status, 'ready');
    assert.equal(readiness.components.documentIntelligence.requiredForReadiness, true);
    assert.equal(readiness.components.documentIntelligence.ocr.status, 'unavailable');
    assert.equal(readiness.status, 'unavailable');
  } finally {
    await fixture.cleanup();
  }
});

test('optional OCR keeps the core pipeline ready while exposing OCR unavailability', async () => {
  const fixture = await createHealthFixture(
    {
      DOCUMENT_OCR_DRIVER: 'local',
      DOCUMENT_OCR_LANGUAGES: 'eng',
      DOCUMENT_OCR_REQUIRED_FOR_READINESS: 'false',
    },
    {
      available: false,
      languages: [],
      pdfSupported: false,
    },
  );
  try {
    const readiness = await fixture.check();
    assert.equal(readiness.components.core.status, 'ready');
    assert.equal(readiness.components.documentIntelligence.requiredForReadiness, false);
    assert.equal(readiness.components.documentIntelligence.ocr.status, 'unavailable');
    assert.equal(readiness.status, 'ready');
  } finally {
    await fixture.cleanup();
  }
});

test('production cannot disable OCR or make it optional for readiness', () => {
  const productionEnvironment = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://example.test/avantime',
    OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
    OBJECT_STORAGE_REGION: 'test-1',
    OBJECT_STORAGE_BUCKET: 'private-documents',
    OBJECT_STORAGE_ACCESS_KEY: 'test-access',
    OBJECT_STORAGE_SECRET_KEY: 'test-secret',
    DOCUMENT_PROCESSING_QUEUE_NAME: 'documents',
  };

  assert.throws(
    () =>
      loadDocumentConfiguration({
        ...productionEnvironment,
        DOCUMENT_OCR_DRIVER: 'disabled',
      }),
    /Production document OCR must use a configured provider/,
  );
  assert.throws(
    () =>
      loadDocumentConfiguration({
        ...productionEnvironment,
        DOCUMENT_OCR_DRIVER: 'local',
        DOCUMENT_OCR_REQUIRED_FOR_READINESS: 'false',
      }),
    /Production document OCR must be required for readiness/,
  );
});

test('document readiness is deny-by-default when configuration is invalid', async () => {
  const readiness = await checkDocumentReadiness({
    loadConfiguration: () => {
      throw new Error('postgresql://user:secret@production.example/database');
    },
  });

  assert.equal(readiness.status, 'unavailable');
  assert.deepEqual(readiness.components, {
    core: {
      status: 'unavailable',
      configuration: 'unavailable',
      worker: 'unavailable',
      metadata: 'unavailable',
      storage: 'unavailable',
      queue: 'unavailable',
    },
    documentIntelligence: {
      status: 'unavailable',
      requiredForReadiness: true,
      textQuality: 'unavailable',
      typeDetection: 'unavailable',
      ocr: {
        status: 'unavailable',
        runtime: 'unavailable',
        languages: 'unavailable',
        pdfSupport: 'unavailable',
      },
    },
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

test('ordinary integration suite excludes the real OCR runtime test', async () => {
  const integrationRunner = await readFile(
    path.join(process.cwd(), 'scripts', 'run-document-integration-tests.ts'),
    'utf8',
  );

  assert.match(integrationRunner, /file !== 'document-ocr\.integration\.test\.ts'/);
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
