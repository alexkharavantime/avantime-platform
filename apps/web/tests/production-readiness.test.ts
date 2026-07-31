import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { MemoryAiCostController, MemoryAiRateLimiter, RedisAiRateLimiter } from '../lib/ai-control';
import {
  createBackupPlan,
  decryptBackupPayload,
  encryptBackupPayload,
  validateRestoreRehearsalEnvironment,
} from '../lib/backup-restore';
import { LocalDocumentProcessingQueue } from '../lib/document-processing-queue';
import { validatePgvectorLoadConfiguration } from '../lib/pgvector-load-test';
import { splitPagesIntoChunks } from '../lib/pdf-extractor';
import { validateProductionConfiguration } from '../lib/production-configuration';
import { ConsoleProductionTelemetry, createTenantReference } from '../lib/production-observability';
import { MemoryProductionAuditTrail } from '../lib/production-audit';
import { summarizeWorkerHeartbeats } from '../lib/worker-lease';

const tenant = { companyId: 'tenant-a', userId: 'user-a' };

function productionEnvironment() {
  return {
    NODE_ENV: 'production',
    SESSION_SECRET: 'session-secret-with-more-than-32-characters',
    MFA_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
    MFA_ENCRYPTION_KEY_VERSION: 'test-v1',
    AUTH_ADMIN_MFA_REQUIRED: 'true',
    AUTH_PUBLIC_ORIGIN: 'https://portal.example.com',
    OIDC_ALLOWED_HOSTS: 'login.microsoftonline.com,accounts.google.com',
    IDENTITY_EMAIL_DRIVER: 'resend',
    MAIL_FROM: 'security@portal.example.com',
    RESEND_API_KEY: 'resend-key-with-more-than-20-characters',
    DATABASE_URL: 'postgresql://user:password@database.example.com/avantime?sslmode=verify-full',
    DOCUMENT_STORAGE_DRIVER: 's3',
    DOCUMENT_METADATA_DRIVER: 'postgresql',
    DOCUMENT_PROCESSING_QUEUE_DRIVER: 'external',
    DOCUMENT_PROCESSING_QUEUE_NAME: 'document-processing',
    REDIS_URL: 'rediss://default:strong-password@redis.example.com:6379/0',
    DOCUMENT_OCR_DRIVER: 'local',
    DOCUMENT_OCR_REQUIRED_FOR_READINESS: 'true',
    OBJECT_STORAGE_ENDPOINT: 'https://objects.example.com',
    OBJECT_STORAGE_REGION: 'eu-central-1',
    OBJECT_STORAGE_BUCKET: 'avantime-documents',
    OBJECT_STORAGE_ACCESS_KEY: 'access-key-placeholder-value',
    OBJECT_STORAGE_SECRET_KEY: 'object-secret-with-more-than-32-characters',
    DOCUMENT_EMBEDDING_DRIVER: 'openai',
    DOCUMENT_EMBEDDING_MODEL: 'text-embedding-3-small',
    DOCUMENT_EMBEDDING_DIMENSIONS: '1536',
    DOCUMENT_EMBEDDING_QUEUE_DRIVER: 'redis',
    DOCUMENT_VECTOR_DRIVER: 'pgvector',
    RAG_ANSWER_DRIVER: 'openai',
    RAG_ANSWER_MODEL: 'gpt-5-mini',
    DOCUMENT_RAG_REQUIRED_FOR_READINESS: 'true',
    OPENAI_API_KEY: 'openai-key-with-more-than-20-characters',
    AI_RATE_LIMIT_DRIVER: 'redis',
    AI_COST_LEDGER_DRIVER: 'postgresql',
    BACKUP_DRIVER: 's3',
    BACKUP_ENCRYPTION_REQUIRED: 'true',
    BACKUP_OBJECT_STORAGE_SSE: 'AES256',
    BACKUP_ENCRYPTION_KEY: 'backup-key-with-more-than-32-characters',
    BACKUP_STORAGE_ENDPOINT: 'https://backups.example.com',
    AUDIT_INTEGRITY_KEY: 'audit-key-with-more-than-32-characters',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://telemetry.example.com',
  };
}

test('local lease fencing rejects stale writer and recovers an expired job', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'avantime-fencing-'));
  try {
    const queue = new LocalDocumentProcessingQueue(directory);
    const enqueued = await queue.enqueue(tenant, 'document-1');
    const now = new Date();
    const first = await queue.claim(tenant, 'worker-1', {
      now,
      leaseDurationMs: 1_000,
    });
    const second = await queue.claim(tenant, 'worker-2', {
      now: new Date(now.getTime() + 2_000),
      leaseDurationMs: 10_000,
    });
    assert.equal(enqueued.enqueued, true);
    assert.equal((await queue.enqueue(tenant, 'document-1')).enqueued, false);
    assert.equal(first?.fencingToken, 1);
    assert.equal(second?.fencingToken, 2);
    await assert.rejects(() =>
      queue.acknowledge(tenant, first!.id, 'worker-1', first!.fencingToken),
    );
    await queue.acknowledge(tenant, second!.id, 'worker-2', second!.fencingToken);
    assert.deepEqual(await queue.list(tenant), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('local queue renews heartbeat lease and payload never contains document content', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'avantime-heartbeat-'));
  try {
    const queue = new LocalDocumentProcessingQueue(directory);
    await queue.enqueue(tenant, 'document-2');
    const job = await queue.claim(tenant, 'worker-1', { leaseDurationMs: 5_000 });
    const renewed = await queue.renew(tenant, job!.id, 'worker-1', job!.fencingToken!, 10_000);
    assert.ok(new Date(renewed.leaseExpiresAt!).getTime() > Date.now());
    const queueFile = path.join(
      directory,
      'document-tenants',
      tenant.companyId,
      'processing-queue.json',
    );
    const stored = await readFile(queueFile, 'utf8');
    assert.doesNotMatch(stored, /document content|prompt|answer|embedding/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('worker heartbeat summary cannot hide a stale active job behind a fresh worker', () => {
  const components = summarizeWorkerHeartbeats([
    {
      component: 'document',
      heartbeatAgeMs: 900_000,
      activeJobs: 2,
      staleJobs: 1,
    },
    {
      component: 'embedding',
      heartbeatAgeMs: null,
      activeJobs: 0,
      staleJobs: 0,
    },
  ]);

  assert.equal(components.document.status, 'unavailable');
  assert.equal(components.document.staleJobs, 1);
  assert.equal(components.embedding.status, 'ready');
});

test('queue payload validation rejects unsafe tenant-aware identifiers', async () => {
  const queue = new LocalDocumentProcessingQueue();
  await assert.rejects(() => queue.enqueue(tenant, '../document'));
});

test('memory and Redis rate-limit contracts enforce atomic burst limits', async () => {
  const limiter = new MemoryAiRateLimiter(() => new Date('2026-01-01T12:00:00Z'));
  const request = {
    tenant,
    provider: 'fake',
    requestType: 'rag_answer' as const,
    minuteLimit: 3,
    dailyLimit: 10,
    burstLimit: 2,
  };
  assert.equal(await limiter.consume(request), true);
  assert.equal(await limiter.consume(request), true);
  assert.equal(await limiter.consume(request), false);

  const commands: string[][] = [];
  const distributed = new RedisAiRateLimiter({
    async sendCommand(arguments_) {
      commands.push(arguments_);
      return 1;
    },
  });
  assert.equal(await distributed.consume(request), true);
  assert.equal(commands[0][0], 'EVAL');
  assert.doesNotMatch(commands[0].join(' '), /tenant-a|user-a/);
});

test('budget reservations prevent concurrent overspend and usage reconciliation is idempotent', async () => {
  const controller = new MemoryAiCostController(1, 10);
  const request = {
    tenant,
    provider: 'fake',
    model: 'fake-v1',
    requestType: 'rag_answer' as const,
    correlationId: 'correlation-1',
    idempotencyKey: 'request-1',
    estimatedCostEur: 0.75,
  };
  const [first, duplicate, overspend] = await Promise.all([
    controller.reserve(request),
    controller.reserve(request),
    controller.reserve({
      ...request,
      correlationId: 'correlation-2',
      idempotencyKey: 'request-2',
    }),
  ]);
  assert.ok(first);
  assert.equal(duplicate, null);
  assert.equal(overspend, null);
  const event = {
    reservation: first!,
    inputTokens: 10,
    outputTokens: 2,
    embeddingUnits: 0,
    estimatedCostEur: 0.5,
    status: 'SUCCEEDED' as const,
  };
  await controller.reconcile(event);
  await controller.reconcile(event);
  assert.ok(
    await controller.reserve({
      ...request,
      idempotencyKey: 'request-3',
      estimatedCostEur: 0.5,
    }),
  );
});

test('audit trail is append-only and rejects content or secret metadata', async () => {
  const audit = new MemoryProductionAuditTrail();
  const entry = {
    companyId: tenant.companyId,
    actorId: tenant.userId,
    action: 'document.reindex',
    targetType: 'document',
    targetId: 'document-1',
    result: 'SUCCEEDED' as const,
    correlationId: 'correlation-1',
    safeMetadata: { dryRun: false },
  };
  await audit.append(entry);
  const listed = await audit.list(tenant.companyId);
  (listed[0].safeMetadata as { dryRun: boolean }).dryRun = true;
  assert.equal((await audit.list(tenant.companyId))[0].safeMetadata?.dryRun, false);
  await assert.rejects(() =>
    audit.append({ ...entry, correlationId: 'correlation-2', safeMetadata: { prompt: 'secret' } }),
  );
});

test('production config rejects local adapters, placeholders, missing TLS, and private provider URLs', () => {
  assert.equal(validateProductionConfiguration(productionEnvironment()).valid, true);
  assert.throws(() =>
    validateProductionConfiguration({
      ...productionEnvironment(),
      DOCUMENT_PROCESSING_QUEUE_DRIVER: 'local',
    }),
  );
  assert.throws(() =>
    validateProductionConfiguration({
      ...productionEnvironment(),
      OPENAI_BASE_URL: 'https://127.0.0.1/v1',
    }),
  );
  assert.throws(() =>
    validateProductionConfiguration({
      ...productionEnvironment(),
      REDIS_URL: 'redis://default:password@redis.example.com:6379',
    }),
  );
  assert.throws(() =>
    validateProductionConfiguration({
      ...productionEnvironment(),
      OIDC_ALLOWED_HOSTS: 'localhost',
    }),
  );
});

test('backup and restore guards restrict output and isolated target', () => {
  assert.equal(
    createBackupPlan(
      {
        DATABASE_URL: 'postgresql://user:password@db/avantime_integration',
        BACKUP_ENVIRONMENT: 'integration',
        BACKUP_OUTPUT_DIR: '/tmp/avantime-backup-test',
        BACKUP_ENCRYPTION_REQUIRED: 'true',
        BACKUP_TIMESTAMP: '2026-01-01T000000Z',
      },
      true,
    ).dryRun,
    true,
  );
  assert.throws(() =>
    validateRestoreRehearsalEnvironment({
      DATABASE_URL: 'postgresql://user:password@db/avantime',
      RESTORE_DATABASE_URL: 'postgresql://user:password@db/avantime',
      RESTORE_REHEARSAL_ALLOWED: 'true',
      RESTORE_CONFIRMATION: 'RESTORE:avantime',
    }),
  );
  const plaintext = Buffer.from('encrypted-backup-test');
  const encrypted = encryptBackupPayload(
    plaintext,
    'backup-encryption-secret-with-more-than-32-characters',
  );
  assert.notDeepEqual(encrypted, plaintext);
  assert.deepEqual(
    decryptBackupPayload(encrypted, 'backup-encryption-secret-with-more-than-32-characters'),
    plaintext,
  );
  assert.throws(() =>
    decryptBackupPayload(encrypted, 'wrong-backup-encryption-secret-with-more-than-32-characters'),
  );
});

test('page provenance maps PDF/OCR chunks and validates ANN load configuration', () => {
  const result = splitPagesIntoChunks(['First page text.', 'Second page text.'], 'OCR');
  assert.deepEqual(
    result.chunks.map((chunk) => [chunk.pageStart, chunk.pageEnd, chunk.extractionMethod]),
    [
      [1, 1, 'OCR'],
      [2, 2, 'OCR'],
    ],
  );
  assert.doesNotThrow(() =>
    validatePgvectorLoadConfiguration({
      tenants: 2,
      documentsPerTenant: 2,
      chunksPerDocument: 2,
      dimensions: 32,
      concurrentQueries: 2,
      queryCount: 5,
      topK: 2,
      seed: 42,
      strategies: ['exact', 'hnsw'],
    }),
  );
  assert.throws(() =>
    validatePgvectorLoadConfiguration({
      tenants: 0,
      documentsPerTenant: 2,
      chunksPerDocument: 2,
      dimensions: 32,
      concurrentQueries: 2,
      queryCount: 5,
      topK: 2,
      seed: 42,
      strategies: ['exact'],
    }),
  );
});

test('telemetry hashes tenant IDs and rejects content-bearing attributes', () => {
  const reference = createTenantReference(
    tenant.companyId,
    'integrity-key-with-more-than-32-characters',
  );
  assert.notEqual(reference, tenant.companyId);
  const telemetry = new ConsoleProductionTelemetry();
  assert.throws(() => telemetry.log('info', 'unsafe', { prompt: 'forbidden' } as never));
});
