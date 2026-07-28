import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadDocumentConfiguration,
  loadDocumentWorkerConfiguration,
} from '../lib/document-configuration';
import type { DocumentTenantContext, TextChunk } from '../lib/document-model';
import { DocumentProcessingError } from '../lib/document-processing-errors';
import {
  LocalDocumentProcessingQueue,
  type DocumentProcessingQueue,
  type ExternalDocumentProcessingQueue,
} from '../lib/document-processing-queue';
import { retryDocumentProcessing } from '../lib/document-quarantine';
import type { DocumentProcessingRepository } from '../lib/document-repositories';
import {
  createDocumentProcessingWorker,
  createDocumentServices,
  enqueueUploadedDocument,
  reprocessDocument,
  type DocumentServices,
} from '../lib/document-services';

const companyA: DocumentTenantContext = {
  companyId: 'company-a',
  userId: 'user-a',
};
const companyB: DocumentTenantContext = {
  companyId: 'company-b',
  userId: 'user-b',
};

const extracted = {
  text: 'Extracted document text.',
  pages: 1,
  chunks: [
    {
      id: '0',
      index: 0,
      text: 'Extracted document text.',
      start: 0,
      end: 24,
    },
  ] satisfies TextChunk[],
  chunksCount: 1,
};

async function createFixture(environment: Record<string, string | undefined> = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'avantime-processing-'));
  const configuration = loadDocumentConfiguration({
    NODE_ENV: 'development',
    DOCUMENT_DATA_DIR: directory,
    ...environment,
  });
  const services = createDocumentServices(configuration);

  return {
    directory,
    services,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

async function createUploadedDocument(
  services: DocumentServices,
  tenant: DocumentTenantContext,
  documentId: string,
  data?: Buffer,
) {
  const content = data ?? Buffer.from('valid pdf bytes');
  const storedName = `${documentId}.pdf`;
  const stored = await services.storage.write(tenant, 'original', storedName, content);
  const now = new Date().toISOString();
  return services.metadata.create(tenant, {
    id: documentId,
    status: 'UPLOADED',
    originalName: storedName,
    storedName,
    mimeType: 'application/pdf',
    size: content.length,
    checksum: stored.checksum,
    createdAt: now,
    updatedAt: now,
  });
}

async function createQueuedDocument(
  services: DocumentServices,
  tenant: DocumentTenantContext,
  documentId: string,
  data?: Buffer,
) {
  await createUploadedDocument(services, tenant, documentId, data);
  const result = await enqueueUploadedDocument(tenant, documentId, services);
  assert.ok(result);
  return result.document;
}

test('upload route never extracts PDF text inside the HTTP request', async () => {
  const route = await readFile(
    path.join(process.cwd(), 'app/api/documents/upload/route.ts'),
    'utf8',
  );

  assert.doesNotMatch(route, /pdf-extractor|extractPdfText/);
  assert.match(route, /enqueueUploadedDocument/);
});

test('local queue enqueue is idempotent for one tenant document', async () => {
  const fixture = await createFixture();
  try {
    await createUploadedDocument(fixture.services, companyA, 'idempotent-enqueue');
    const first = await enqueueUploadedDocument(companyA, 'idempotent-enqueue', fixture.services);
    const second = await enqueueUploadedDocument(companyA, 'idempotent-enqueue', fixture.services);

    assert.equal(first?.enqueued, true);
    assert.equal(second?.enqueued, false);
    assert.equal(first?.job.id, second?.job.id);
    assert.equal((await fixture.services.queue.list(companyA)).length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test('single-document reprocess is tenant-aware, dry-run safe and idempotent', async () => {
  const fixture = await createFixture();
  try {
    await createQueuedDocument(fixture.services, companyA, 'reprocess-one');
    const worker = createDocumentProcessingWorker(fixture.services, {
      extractor: async () => extracted,
    });
    assert.equal((await worker.runOnce(companyA, 'reprocess-worker')).outcome, 'COMPLETED');

    assert.equal(
      (await reprocessDocument(companyA, 'reprocess-one', { dryRun: true }, fixture.services))
        .outcome,
      'WOULD_REPROCESS',
    );
    assert.equal(
      (await fixture.services.metadata.findById(companyA, 'reprocess-one'))?.status,
      'COMPLETED',
    );
    assert.equal(
      (await reprocessDocument(companyB, 'reprocess-one', { dryRun: false }, fixture.services))
        .outcome,
      'NOT_FOUND',
    );
    assert.equal(
      (await reprocessDocument(companyA, 'reprocess-one', { dryRun: false }, fixture.services))
        .outcome,
      'QUEUED',
    );
    assert.equal(
      (await reprocessDocument(companyA, 'reprocess-one', { dryRun: false }, fixture.services))
        .outcome,
      'ALREADY_QUEUED',
    );
    assert.equal((await fixture.services.queue.list(companyA)).length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test('worker recovers a job enqueued before metadata reached QUEUED', async () => {
  const fixture = await createFixture();
  try {
    await createUploadedDocument(fixture.services, companyA, 'enqueue-transition-recovery');
    await fixture.services.queue.enqueue(companyA, 'enqueue-transition-recovery');
    const worker = createDocumentProcessingWorker(fixture.services, {
      extractor: async () => extracted,
    });

    assert.equal((await worker.runOnce(companyA, 'recovery-worker')).outcome, 'COMPLETED');
    assert.equal(
      (await fixture.services.metadata.findById(companyA, 'enqueue-transition-recovery'))?.status,
      'COMPLETED',
    );
  } finally {
    await fixture.cleanup();
  }
});

test('two workers cannot process the same document concurrently', async () => {
  const fixture = await createFixture();
  let releaseExtractor!: () => void;
  let extractorStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    extractorStarted = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseExtractor = resolve;
  });

  try {
    await createQueuedDocument(fixture.services, companyA, 'single-worker');
    const firstWorker = createDocumentProcessingWorker(fixture.services, {
      extractor: async () => {
        extractorStarted();
        await release;
        return extracted;
      },
    });
    const secondWorker = createDocumentProcessingWorker(fixture.services, {
      extractor: async () => {
        throw new Error('The second worker must not run.');
      },
    });

    const firstRun = firstWorker.runOnce(companyA, 'worker-one');
    await started;
    const secondRun = await secondWorker.runOnce(companyA, 'worker-two');
    assert.equal(secondRun.outcome, 'IDLE');

    releaseExtractor();
    assert.equal((await firstRun).outcome, 'COMPLETED');
    assert.equal(
      (await fixture.services.metadata.findById(companyA, 'single-worker'))?.status,
      'COMPLETED',
    );
  } finally {
    releaseExtractor?.();
    await fixture.cleanup();
  }
});

test('a worker scoped to tenant A cannot process a tenant B job', async () => {
  const fixture = await createFixture();
  try {
    await createQueuedDocument(fixture.services, companyB, 'tenant-b-job');
    const worker = createDocumentProcessingWorker(fixture.services, {
      extractor: async () => extracted,
    });

    assert.equal((await worker.runOnce(companyA, 'worker-a')).outcome, 'IDLE');
    assert.equal(
      (await fixture.services.metadata.findById(companyB, 'tenant-b-job'))?.status,
      'QUEUED',
    );
    assert.equal((await fixture.services.queue.list(companyB)).length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test('checksum mismatch permanently stops document processing', async () => {
  const fixture = await createFixture();
  try {
    await createUploadedDocument(fixture.services, companyA, 'checksum-mismatch');
    await fixture.services.metadata.update(companyA, 'checksum-mismatch', {
      checksum: 'f'.repeat(64),
    });
    await enqueueUploadedDocument(companyA, 'checksum-mismatch', fixture.services);
    const worker = createDocumentProcessingWorker(fixture.services, {
      extractor: async () => extracted,
    });

    const result = await worker.runOnce(companyA, 'checksum-worker');
    const document = await fixture.services.metadata.findById(companyA, 'checksum-mismatch');
    assert.equal(result.outcome, 'FAILED');
    assert.equal(result.errorCode, 'CHECKSUM_MISMATCH');
    assert.equal(document?.status, 'FAILED');
    assert.equal(document?.lastErrorCode, 'CHECKSUM_MISMATCH');
    assert.equal((await fixture.services.queue.list(companyA)).length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test('successful job moves through QUEUED, PROCESSING and COMPLETED', async () => {
  const fixture = await createFixture();
  try {
    await createQueuedDocument(fixture.services, companyA, 'successful-job');
    assert.equal(
      (await fixture.services.metadata.findById(companyA, 'successful-job'))?.status,
      'QUEUED',
    );
    const worker = createDocumentProcessingWorker(fixture.services, {
      extractor: async () => {
        assert.equal(
          (await fixture.services.metadata.findById(companyA, 'successful-job'))?.status,
          'PROCESSING',
        );
        return extracted;
      },
    });

    const result = await worker.runOnce(companyA, 'success-worker');
    const document = await fixture.services.metadata.findById(companyA, 'successful-job');
    assert.equal(result.outcome, 'COMPLETED');
    assert.equal(document?.status, 'COMPLETED');
    assert.equal(document?.processingAttempts, 1);
    assert.ok(document?.processingStartedAt);
    assert.ok(document?.processingCompletedAt);
    assert.equal(document?.workerId, null);
  } finally {
    await fixture.cleanup();
  }
});

test('transient processing error increments attempts and schedules exponential retry', async () => {
  const fixture = await createFixture({
    DOCUMENT_PROCESSING_INITIAL_RETRY_MS: '1000',
    DOCUMENT_PROCESSING_MAX_RETRY_MS: '10000',
  });
  let now = new Date('2099-07-27T12:00:00.000Z');

  try {
    await createQueuedDocument(fixture.services, companyA, 'transient-error');
    const worker = createDocumentProcessingWorker(fixture.services, {
      now: () => now,
      extractor: async () => {
        throw new DocumentProcessingError(
          'TEMPORARY_EXTRACTOR_ERROR',
          true,
          'Временная ошибка обработки документа.',
        );
      },
    });

    const result = await worker.runOnce(companyA, 'retry-worker');
    const document = await fixture.services.metadata.findById(companyA, 'transient-error');
    assert.equal(result.outcome, 'RETRY_SCHEDULED');
    assert.equal(document?.status, 'QUEUED');
    assert.equal(document?.processingAttempts, 1);
    assert.equal(document?.nextRetryAt, '2099-07-27T12:00:01.000Z');

    now = new Date('2099-07-27T12:00:00.500Z');
    assert.equal((await worker.runOnce(companyA, 'retry-worker')).outcome, 'IDLE');
  } finally {
    await fixture.cleanup();
  }
});

test('permanent processing error is not retried indefinitely', async () => {
  const fixture = await createFixture();
  try {
    await createQueuedDocument(fixture.services, companyA, 'permanent-error');
    const worker = createDocumentProcessingWorker(fixture.services, {
      extractor: async () => {
        throw new DocumentProcessingError(
          'INVALID_DOCUMENT',
          false,
          'Документ повреждён или не поддерживается.',
        );
      },
    });

    assert.equal((await worker.runOnce(companyA, 'permanent-worker')).outcome, 'FAILED');
    assert.equal(
      (await fixture.services.metadata.findById(companyA, 'permanent-error'))?.status,
      'FAILED',
    );
    assert.equal((await fixture.services.queue.list(companyA)).length, 0);
    assert.equal((await worker.runOnce(companyA, 'permanent-worker')).outcome, 'IDLE');
  } finally {
    await fixture.cleanup();
  }
});

test('document enters quarantine after the configured retry limit', async () => {
  const fixture = await createFixture({
    DOCUMENT_PROCESSING_MAX_ATTEMPTS: '2',
    DOCUMENT_PROCESSING_INITIAL_RETRY_MS: '1000',
  });
  let now = new Date('2099-07-27T12:00:00.000Z');

  try {
    await createQueuedDocument(fixture.services, companyA, 'quarantine-limit');
    const worker = createDocumentProcessingWorker(fixture.services, {
      now: () => now,
      extractor: async () => {
        throw new DocumentProcessingError(
          'TEMPORARY_EXTRACTOR_ERROR',
          true,
          'Временная ошибка обработки документа.',
        );
      },
    });

    assert.equal((await worker.runOnce(companyA, 'quarantine-worker')).outcome, 'RETRY_SCHEDULED');
    now = new Date('2099-07-27T12:00:02.000Z');
    assert.equal((await worker.runOnce(companyA, 'quarantine-worker')).outcome, 'QUARANTINED');
    const document = await fixture.services.metadata.findById(companyA, 'quarantine-limit');
    assert.equal(document?.status, 'QUARANTINED');
    assert.equal(document?.processingAttempts, 2);
    assert.ok(document?.quarantinedAt);
  } finally {
    await fixture.cleanup();
  }
});

test('retrying a quarantined document is tenant-aware and idempotently queues it', async () => {
  const fixture = await createFixture();
  try {
    await createQueuedDocument(fixture.services, companyA, 'manual-retry');
    await fixture.services.metadata.transitionStatus(
      companyA,
      'manual-retry',
      ['QUEUED'],
      'QUARANTINED',
      {
        quarantinedAt: new Date().toISOString(),
      },
    );
    await fixture.services.queue.removeForDocument(companyA, 'manual-retry');

    assert.equal(await retryDocumentProcessing(companyB, 'manual-retry', fixture.services), null);
    const first = await retryDocumentProcessing(companyA, 'manual-retry', fixture.services);
    assert.equal(first?.document.status, 'QUEUED');
    assert.equal(first?.enqueued, true);
    assert.equal((await fixture.services.queue.list(companyA)).length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test('invalid document status transition is rejected centrally', async () => {
  const fixture = await createFixture();
  try {
    await createUploadedDocument(fixture.services, companyA, 'invalid-transition');
    await fixture.services.metadata.transitionStatus(
      companyA,
      'invalid-transition',
      ['UPLOADED'],
      'QUEUED',
    );
    await fixture.services.metadata.transitionStatus(
      companyA,
      'invalid-transition',
      ['QUEUED'],
      'PROCESSING',
    );
    await fixture.services.metadata.transitionStatus(
      companyA,
      'invalid-transition',
      ['PROCESSING'],
      'COMPLETED',
    );

    await assert.rejects(
      fixture.services.metadata.transitionStatus(
        companyA,
        'invalid-transition',
        ['COMPLETED'],
        'PROCESSING',
      ),
      /invalid document status transition/i,
    );
  } finally {
    await fixture.cleanup();
  }
});

test('partial text or chunks never leaves a document COMPLETED', async () => {
  const fixture = await createFixture();
  try {
    await createQueuedDocument(fixture.services, companyA, 'partial-result');
    const partialRepository: DocumentProcessingRepository = {
      ...fixture.services.processing,
      save: async (tenant, documentId, result) => {
        await fixture.services.storage.write(
          tenant,
          'text',
          `${documentId}.txt`,
          Buffer.from(result.text),
        );
        throw new DocumentProcessingError(
          'DERIVATIVE_WRITE_FAILED',
          false,
          'Не удалось сохранить результат обработки.',
        );
      },
      readText: fixture.services.processing.readText.bind(fixture.services.processing),
      readChunks: fixture.services.processing.readChunks.bind(fixture.services.processing),
      delete: fixture.services.processing.delete.bind(fixture.services.processing),
    };
    const worker = createDocumentProcessingWorker(
      {
        ...fixture.services,
        processing: partialRepository,
      },
      {
        extractor: async () => extracted,
      },
    );

    assert.equal((await worker.runOnce(companyA, 'partial-worker')).outcome, 'FAILED');
    assert.equal(
      (await fixture.services.metadata.findById(companyA, 'partial-result'))?.status,
      'FAILED',
    );
    assert.equal(await fixture.services.processing.readText(companyA, 'partial-result'), null);
    assert.deepEqual(await fixture.services.processing.readChunks(companyA, 'partial-result'), []);
  } finally {
    await fixture.cleanup();
  }
});

test('worker restart safely reclaims an expired lease', async () => {
  const fixture = await createFixture();
  const startedAt = new Date('2099-07-27T12:00:00.000Z');
  const restartedAt = new Date('2099-07-27T12:00:01.000Z');

  try {
    await createQueuedDocument(fixture.services, companyA, 'worker-restart');
    const deadJob = await fixture.services.queue.claim(companyA, 'dead-worker', {
      now: startedAt,
      leaseDurationMs: 100,
    });
    assert.ok(deadJob);
    await fixture.services.metadata.transitionStatus(
      companyA,
      'worker-restart',
      ['QUEUED'],
      'PROCESSING',
      {
        processingAttempts: 1,
        workerId: 'dead-worker',
        processingStartedAt: startedAt.toISOString(),
      },
    );

    const restartedWorker = createDocumentProcessingWorker(fixture.services, {
      now: () => restartedAt,
      extractor: async () => extracted,
    });
    assert.equal(
      (await restartedWorker.runOnce(companyA, 'restarted-worker')).outcome,
      'COMPLETED',
    );
    const document = await fixture.services.metadata.findById(companyA, 'worker-restart');
    assert.equal(document?.status, 'COMPLETED');
    assert.equal(document?.processingAttempts, 2);
    assert.equal((await fixture.services.queue.list(companyA)).length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test('acknowledge failure preserves a completed result for safe recovery', async () => {
  const fixture = await createFixture();
  try {
    await createQueuedDocument(fixture.services, companyA, 'acknowledge-recovery');
    let failAcknowledge = true;
    const baseQueue = fixture.services.queue;
    const unreliableQueue: DocumentProcessingQueue = {
      kind: 'local',
      enqueue: baseQueue.enqueue.bind(baseQueue),
      claim: baseQueue.claim.bind(baseQueue),
      acknowledge: async (tenant, jobId, workerId) => {
        if (failAcknowledge) {
          failAcknowledge = false;
          throw new Error('queue acknowledge unavailable');
        }
        await baseQueue.acknowledge(tenant, jobId, workerId);
      },
      release: baseQueue.release.bind(baseQueue),
      removeForDocument: baseQueue.removeForDocument.bind(baseQueue),
      list: baseQueue.list.bind(baseQueue),
    };
    const firstWorker = createDocumentProcessingWorker(
      {
        ...fixture.services,
        queue: unreliableQueue,
      },
      {
        extractor: async () => extracted,
      },
    );

    await assert.rejects(
      firstWorker.runOnce(companyA, 'unreliable-worker'),
      /queue acknowledge unavailable/,
    );
    assert.equal(
      (await fixture.services.metadata.findById(companyA, 'acknowledge-recovery'))?.status,
      'COMPLETED',
    );
    assert.equal(
      await fixture.services.processing.readText(companyA, 'acknowledge-recovery'),
      extracted.text,
    );

    const recoveryWorker = createDocumentProcessingWorker(fixture.services, {
      now: () => new Date(Date.now() + fixture.services.queueLeaseDurationMs + 1),
      extractor: async () => {
        throw new Error('Completed document must not be extracted again.');
      },
    });
    assert.equal(
      (await recoveryWorker.runOnce(companyA, 'acknowledge-recovery-worker')).outcome,
      'SKIPPED',
    );
    assert.equal((await fixture.services.queue.list(companyA)).length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test('production queue configuration fails fast without a complete external adapter setup', () => {
  assert.throws(
    () =>
      loadDocumentConfiguration({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://example.test/avantime',
        OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
        OBJECT_STORAGE_REGION: 'test-1',
        OBJECT_STORAGE_BUCKET: 'private-documents',
        OBJECT_STORAGE_ACCESS_KEY: 'test-access',
        OBJECT_STORAGE_SECRET_KEY: 'test-secret',
      }),
    /DOCUMENT_PROCESSING_QUEUE_NAME is required/,
  );

  assert.throws(
    () =>
      loadDocumentConfiguration({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://example.test/avantime',
        OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
        OBJECT_STORAGE_REGION: 'test-1',
        OBJECT_STORAGE_BUCKET: 'private-documents',
        OBJECT_STORAGE_ACCESS_KEY: 'test-access',
        OBJECT_STORAGE_SECRET_KEY: 'test-secret',
        DOCUMENT_PROCESSING_QUEUE_NAME: 'documents',
      }),
    /DOCUMENT_OCR_DRIVER is required/,
  );
  assert.throws(
    () =>
      loadDocumentConfiguration({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://example.test/avantime',
        OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
        OBJECT_STORAGE_REGION: 'test-1',
        OBJECT_STORAGE_BUCKET: 'private-documents',
        OBJECT_STORAGE_ACCESS_KEY: 'test-access',
        OBJECT_STORAGE_SECRET_KEY: 'test-secret',
        DOCUMENT_PROCESSING_QUEUE_NAME: 'documents',
        DOCUMENT_OCR_DRIVER: 'local',
        DOCUMENT_OCR_REQUIRED_FOR_READINESS: 'false',
      }),
    /Production document OCR must be required for readiness/,
  );

  const configuration = loadDocumentConfiguration({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://example.test/avantime',
    OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
    OBJECT_STORAGE_REGION: 'test-1',
    OBJECT_STORAGE_BUCKET: 'private-documents',
    OBJECT_STORAGE_ACCESS_KEY: 'test-access',
    OBJECT_STORAGE_SECRET_KEY: 'test-secret',
    DOCUMENT_PROCESSING_QUEUE_NAME: 'documents',
    DOCUMENT_OCR_DRIVER: 'local',
  });
  assert.throws(
    () => createDocumentServices(configuration),
    /external DocumentProcessingQueue adapter is required/,
  );
  assert.throws(
    () =>
      loadDocumentWorkerConfiguration({
        NODE_ENV: 'production',
      }),
    /DOCUMENT_WORKER_TENANT_ID is required/,
  );
  assert.throws(
    () =>
      loadDocumentWorkerConfiguration({
        NODE_ENV: 'production',
        DOCUMENT_WORKER_TENANT_ID: 'avantime',
      }),
    /DOCUMENT_WORKER_ID is required/,
  );
});

test('future external queue adapter can be injected through the stable contract', () => {
  const configuration = loadDocumentConfiguration({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://example.test/avantime',
    OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
    OBJECT_STORAGE_REGION: 'test-1',
    OBJECT_STORAGE_BUCKET: 'private-documents',
    OBJECT_STORAGE_ACCESS_KEY: 'test-access',
    OBJECT_STORAGE_SECRET_KEY: 'test-secret',
    DOCUMENT_PROCESSING_QUEUE_NAME: 'documents',
    DOCUMENT_OCR_DRIVER: 'local',
  });
  const externalQueue: ExternalDocumentProcessingQueue = {
    kind: 'external',
    queueName: 'documents',
    enqueue: async (_tenant, documentId) => ({
      enqueued: true,
      job: {
        id: 'external-job',
        documentId,
        enqueuedAt: new Date(0).toISOString(),
        availableAt: new Date(0).toISOString(),
        attempts: 0,
      },
    }),
    claim: async () => null,
    acknowledge: async () => undefined,
    release: async () => undefined,
    removeForDocument: async () => undefined,
    list: async () => [],
  };
  const services = createDocumentServices(configuration, {
    processingQueue: externalQueue,
    s3Client: {
      send: async () => ({}),
    },
    loadDatabase: async () => null,
  });

  assert.equal(services.queue, externalQueue);
});

test('development uses LocalDocumentProcessingQueue without external infrastructure', async () => {
  const fixture = await createFixture();
  try {
    assert.equal(fixture.services.queue instanceof LocalDocumentProcessingQueue, true);
    await createUploadedDocument(fixture.services, companyA, 'local-development-queue');
    await enqueueUploadedDocument(companyA, 'local-development-queue', fixture.services);
    assert.equal((await fixture.services.queue.list(companyA)).length, 1);
  } finally {
    await fixture.cleanup();
  }
});
