import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import {
  loadDocumentConfiguration,
  loadDocumentWorkerConfiguration,
} from '../lib/document-configuration';
import { migrateDocuments } from '../lib/document-migration';
import type { DocumentTenantContext } from '../lib/document-model';
import { LocalDocumentProcessingQueue } from '../lib/document-processing-queue';
import {
  LocalDocumentHistoryRepository,
  LocalDocumentMetadataRepository,
  LocalDocumentProcessingRepository,
  PostgreSQLDocumentMetadataRepository,
  type CreateDocumentMetadata,
} from '../lib/document-repositories';
import {
  cleanupDeletedDocuments,
  createDocumentServices,
  type DocumentServices,
} from '../lib/document-services';
import {
  calculateDocumentChecksum,
  createDocumentObjectKey,
  LocalDocumentStorage,
  S3DocumentStorage,
  type S3DocumentStorageClient,
} from '../lib/document-storage';
import { DEFAULT_DOCUMENT_RETRY_POLICY } from '../lib/document-retry-policy';

const companyA: DocumentTenantContext = {
  companyId: 'company-a',
  userId: 'user-a',
};
const companyB: DocumentTenantContext = {
  companyId: 'company-b',
  userId: 'user-b',
};

type DatabaseRecord = {
  id: string;
  companyId: string;
  uploadedBy: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  status: string;
  checksum: string;
  processingAttempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  processingStartedAt: Date | null;
  processingCompletedAt: Date | null;
  nextRetryAt: Date | null;
  quarantinedAt: Date | null;
  workerId: string | null;
  pages: number | null;
  textLength: number | null;
  chunksCount: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

class FakeDocumentMetadataDelegate {
  readonly records: DatabaseRecord[] = [];

  async findMany(args: Record<string, unknown>) {
    const where = args.where as Record<string, unknown>;
    return this.records.filter((record) => this.matches(record, where));
  }

  async findFirst(args: Record<string, unknown>) {
    const where = args.where as Record<string, unknown>;
    return this.records.find((record) => this.matches(record, where)) ?? null;
  }

  async create(args: Record<string, unknown>) {
    const data = args.data as DatabaseRecord;
    if (
      this.records.some((record) => record.companyId === data.companyId && record.id === data.id)
    ) {
      throw new Error('duplicate');
    }
    const record: DatabaseRecord = {
      ...data,
      pages: data.pages ?? null,
      textLength: data.textLength ?? null,
      processingAttempts: data.processingAttempts ?? 0,
      lastErrorCode: data.lastErrorCode ?? null,
      lastErrorMessage: data.lastErrorMessage ?? null,
      processingStartedAt: data.processingStartedAt ?? null,
      processingCompletedAt: data.processingCompletedAt ?? null,
      nextRetryAt: data.nextRetryAt ?? null,
      quarantinedAt: data.quarantinedAt ?? null,
      workerId: data.workerId ?? null,
      chunksCount: data.chunksCount ?? null,
      deletedAt: data.deletedAt ?? null,
    };
    this.records.push(record);
    return record;
  }

  async updateMany(args: Record<string, unknown>) {
    const where = args.where as Record<string, unknown>;
    const data = args.data as Partial<DatabaseRecord>;
    let count = 0;
    for (const record of this.records) {
      if (!this.matches(record, where)) continue;
      Object.assign(record, data);
      count += 1;
    }
    return { count };
  }

  async deleteMany(args: Record<string, unknown>) {
    const where = args.where as Record<string, unknown>;
    const before = this.records.length;
    const retained = this.records.filter((record) => !this.matches(record, where));
    this.records.splice(0, this.records.length, ...retained);
    return { count: before - retained.length };
  }

  private matches(record: DatabaseRecord, where: Record<string, unknown>) {
    if (where.companyId !== undefined && record.companyId !== where.companyId) {
      return false;
    }
    if (where.id !== undefined && record.id !== where.id) return false;
    if (typeof where.status === 'string' && record.status !== where.status) return false;
    if (
      typeof where.status === 'object' &&
      where.status !== null &&
      'in' in where.status &&
      !(where.status as { in: string[] }).in.includes(record.status)
    ) {
      return false;
    }
    if (
      typeof where.status === 'object' &&
      where.status !== null &&
      'not' in where.status &&
      record.status === (where.status as { not: string }).not
    ) {
      return false;
    }
    if (where.deletedAt === null && record.deletedAt !== null) return false;
    if (
      typeof where.deletedAt === 'object' &&
      where.deletedAt !== null &&
      'not' in where.deletedAt &&
      (where.deletedAt as { not: unknown }).not === null &&
      record.deletedAt === null
    ) {
      return false;
    }
    return true;
  }
}

class FakeS3Client implements S3DocumentStorageClient {
  readonly objects = new Map<string, Buffer>();
  readonly commands: object[] = [];

  async send(command: object) {
    this.commands.push(command);
    if (command instanceof PutObjectCommand) {
      this.objects.set(command.input.Key!, Buffer.from(command.input.Body as Buffer));
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const data = this.objects.get(command.input.Key!);
      if (!data) {
        const error = new Error('missing');
        error.name = 'NoSuchKey';
        throw error;
      }
      return {
        Body: {
          transformToByteArray: async () => new Uint8Array(data),
        },
      };
    }
    if (command instanceof DeleteObjectCommand) {
      this.objects.delete(command.input.Key!);
      return {};
    }
    throw new Error('unsupported command');
  }
}

function metadata(id: string, data: Buffer): CreateDocumentMetadata {
  const now = new Date().toISOString();
  return {
    id,
    status: 'COMPLETED',
    originalName: `${id}.pdf`,
    storedName: `${id}.pdf`,
    mimeType: 'application/pdf',
    size: data.length,
    checksum: calculateDocumentChecksum(data),
    createdAt: now,
    updatedAt: now,
  };
}

function postgresqlRepository(delegate: FakeDocumentMetadataDelegate) {
  return new PostgreSQLDocumentMetadataRepository(
    async () =>
      ({
        documentMetadata: delegate,
      }) as never,
  );
}

function s3Storage(client: FakeS3Client) {
  return new S3DocumentStorage(
    {
      endpoint: 'https://objects.example.test',
      region: 'test-1',
      bucket: 'private-documents',
      accessKeyId: 'test-access',
      secretAccessKey: 'test-secret',
      forcePathStyle: true,
    },
    client,
  );
}

async function localServices(directory: string): Promise<DocumentServices> {
  const storage = new LocalDocumentStorage(directory);
  return {
    storage,
    metadata: new LocalDocumentMetadataRepository(directory),
    processing: new LocalDocumentProcessingRepository(storage),
    history: new LocalDocumentHistoryRepository(storage),
    queue: new LocalDocumentProcessingQueue(directory),
    retryPolicy: DEFAULT_DOCUMENT_RETRY_POLICY,
    queueLeaseDurationMs: 300_000,
    workerPollIntervalMs: 1_000,
  };
}

test('PostgreSQL metadata queries are tenant-aware', async () => {
  const repository = postgresqlRepository(new FakeDocumentMetadataDelegate());
  const data = Buffer.from('tenant data');
  await repository.create(companyA, metadata('shared-id', data));
  await repository.create(companyB, metadata('shared-id', data));

  assert.equal((await repository.list(companyA)).length, 1);
  assert.equal((await repository.findById(companyA, 'shared-id'))?.companyId, 'company-a');
  assert.equal((await repository.findById(companyB, 'shared-id'))?.companyId, 'company-b');
});

test('PostgreSQL repository rejects missing tenant context', async () => {
  const repository = postgresqlRepository(new FakeDocumentMetadataDelegate());
  await assert.rejects(
    repository.list(undefined as unknown as DocumentTenantContext),
    /tenant context is required/i,
  );
});

test('processing migration normalizes legacy attempts before adding the constraint', async () => {
  const migration = await readFile(
    path.join(
      process.cwd(),
      '..',
      '..',
      'packages',
      'database',
      'prisma',
      'migrations',
      '20260727190000_document_processing_queue',
      'migration.sql',
    ),
    'utf8',
  );
  const nullableColumn = migration.indexOf(
    'ADD COLUMN IF NOT EXISTS "processingAttempts" INTEGER DEFAULT 0',
  );
  const normalization = migration.indexOf(
    'WHERE "processingAttempts" IS NULL OR "processingAttempts" < 0',
  );
  const notNull = migration.indexOf('ALTER COLUMN "processingAttempts" SET NOT NULL');
  const constraint = migration.indexOf('CONSTRAINT "DocumentMetadata_processingAttempts_check"');

  assert.ok(nullableColumn >= 0);
  assert.ok(normalization > nullableColumn);
  assert.ok(notNull > normalization);
  assert.ok(constraint > notNull);
  assert.match(
    migration,
    /ELSE "processingAttempts"\s+END,[\s\S]*WHERE "status" IN \('COMPLETED', 'FAILED'\)/,
  );
});

test('document intelligence migration preserves legacy rows with safe constrained defaults', async () => {
  const migration = await readFile(
    path.join(
      process.cwd(),
      '..',
      '..',
      'packages',
      'database',
      'prisma',
      'migrations',
      '20260728120000_document_intelligence',
      'migration.sql',
    ),
    'utf8',
  );
  assert.match(migration, /ADD COLUMN "detectedDocumentType"[\s\S]*DEFAULT 'UNKNOWN'/);
  assert.match(migration, /"intelligenceVersion" = 'legacy-task-002'/);
  assert.match(migration, /DocumentMetadata_detectionConfidence_check/);
  assert.match(migration, /DocumentMetadata_pageCount_check/);
  assert.match(migration, /DocumentMetadata_extractedCharacterCount_check/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM/i);
});

test('soft-deleted metadata is excluded from normal PostgreSQL get and list', async () => {
  const repository = postgresqlRepository(new FakeDocumentMetadataDelegate());
  const data = Buffer.from('soft delete');
  await repository.create(companyA, metadata('soft-deleted', data));
  await repository.delete(companyA, 'soft-deleted');

  assert.equal(await repository.findById(companyA, 'soft-deleted'), null);
  assert.deepEqual(await repository.list(companyA), []);
  assert.equal((await repository.findDeletedById(companyA, 'soft-deleted'))?.id, 'soft-deleted');
});

test('cleanup failure retains soft-deleted metadata for retry', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'avantime-cleanup-'));

  try {
    const services = await localServices(directory);
    const data = Buffer.from('recoverable cleanup');
    await services.metadata.create(companyA, metadata('cleanup-retry', data));
    await services.metadata.delete(companyA, 'cleanup-retry');
    const failingServices: DocumentServices = {
      ...services,
      storage: {
        ...services.storage,
        kind: 'local',
        write: services.storage.write.bind(services.storage),
        read: services.storage.read.bind(services.storage),
        delete: async () => {
          throw new Error('storage unavailable');
        },
      },
    };

    const result = await cleanupDeletedDocuments(companyA, failingServices);

    assert.deepEqual(result.failed, ['cleanup-retry']);
    assert.equal(
      (await services.metadata.findDeletedById(companyA, 'cleanup-retry'))?.id,
      'cleanup-retry',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('S3 object keys are tenant-prefixed and do not expose public URLs', async () => {
  assert.equal(
    createDocumentObjectKey(companyA, 'original', 'document.pdf'),
    'documents/company-a/original/document.pdf',
  );

  const client = new FakeS3Client();
  const storage = s3Storage(client);
  const data = Buffer.from('private object');
  await storage.write(companyA, 'original', 'document.pdf', data);
  const command = client.commands[0] as PutObjectCommand;
  assert.equal(command.input.Key, 'documents/company-a/original/document.pdf');
  assert.equal('ACL' in command.input, false);
});

test('tenant B cannot delete an S3 object owned by tenant A', async () => {
  const client = new FakeS3Client();
  const storage = s3Storage(client);
  await storage.write(companyA, 'original', 'shared.pdf', Buffer.from('company A'));

  await storage.delete(companyB, 'original', 'shared.pdf');

  assert.equal(client.objects.has('documents/company-a/original/shared.pdf'), true);
});

test('S3 storage blocks path traversal and verifies checksums', async () => {
  const client = new FakeS3Client();
  const storage = s3Storage(client);
  const data = Buffer.from('checksum data');
  const checksum = calculateDocumentChecksum(data);
  const result = await storage.write(companyA, 'original', 'checksum.pdf', data, { checksum });
  assert.equal(result.checksum, checksum);

  client.objects.set('documents/company-a/original/checksum.pdf', Buffer.from('corrupted'));
  await assert.rejects(
    storage.read(companyA, 'original', 'checksum.pdf', {
      expectedChecksum: checksum,
    }),
    /checksum verification failed/i,
  );
  await assert.rejects(
    storage.delete(companyA, 'original', '../company-b/document.pdf'),
    /unsafe path segment/i,
  );
});

test('migration dry-run does not write metadata or objects', async () => {
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), 'avantime-source-'));
  const targetDirectory = await mkdtemp(path.join(os.tmpdir(), 'avantime-target-'));

  try {
    const source = await localServices(sourceDirectory);
    const target = await localServices(targetDirectory);
    const data = Buffer.from('migration dry run');
    await source.metadata.create(companyA, metadata('dry-run', data));
    await source.storage.write(companyA, 'original', 'dry-run.pdf', data);

    const report = await migrateDocuments({
      tenant: companyA,
      source,
      target,
      dryRun: true,
    });

    assert.deepEqual(report.migrated, ['dry-run']);
    assert.deepEqual(await target.metadata.list(companyA), []);
    assert.equal(await target.storage.read(companyA, 'original', 'dry-run.pdf'), null);
  } finally {
    await rm(sourceDirectory, { recursive: true, force: true });
    await rm(targetDirectory, { recursive: true, force: true });
  }
});

test('repeated migration does not duplicate metadata or objects', async () => {
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), 'avantime-source-'));
  const targetDirectory = await mkdtemp(path.join(os.tmpdir(), 'avantime-target-'));

  try {
    const source = await localServices(sourceDirectory);
    const target = await localServices(targetDirectory);
    const data = Buffer.from('idempotent migration');
    await source.metadata.create(companyA, metadata('idempotent', data));
    await source.storage.write(companyA, 'original', 'idempotent.pdf', data);

    const first = await migrateDocuments({
      tenant: companyA,
      source,
      target,
      dryRun: false,
    });
    const second = await migrateDocuments({
      tenant: companyA,
      source,
      target,
      dryRun: false,
    });

    assert.deepEqual(first.migrated, ['idempotent']);
    assert.deepEqual(second.skipped, ['idempotent']);
    assert.equal((await target.metadata.list(companyA)).length, 1);
  } finally {
    await rm(sourceDirectory, { recursive: true, force: true });
    await rm(targetDirectory, { recursive: true, force: true });
  }
});

test('production document configuration fails without required environment', () => {
  assert.throws(
    () =>
      loadDocumentConfiguration({
        NODE_ENV: 'production',
      }),
    /required for the selected document configuration/i,
  );
});

test('development document configuration creates local adapters', () => {
  const configuration = loadDocumentConfiguration({
    NODE_ENV: 'development',
  });
  const services = createDocumentServices(configuration);
  assert.equal(configuration.storageDriver, 'local');
  assert.equal(configuration.metadataDriver, 'local');
  assert.equal(services.storage.kind, 'local');
  assert.equal(services.metadata instanceof LocalDocumentMetadataRepository, true);
});

test('worker configuration rejects unsafe tenant and worker identifiers', () => {
  assert.throws(
    () =>
      loadDocumentWorkerConfiguration({
        NODE_ENV: 'test',
        DOCUMENT_WORKER_TENANT_ID: '../tenant',
        DOCUMENT_WORKER_ID: 'worker',
      }),
    /unsafe path segment/i,
  );
  assert.throws(
    () =>
      loadDocumentWorkerConfiguration({
        NODE_ENV: 'test',
        DOCUMENT_WORKER_TENANT_ID: 'tenant',
        DOCUMENT_WORKER_ID: '../worker',
      }),
    /unsafe path segment/i,
  );
});
