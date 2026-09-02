import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canReadKnowledgeIndex,
  RedisKnowledgeCacheAdapter,
  type KnowledgeIndexDocument,
} from '../lib/knowledge-indexing';
import { knowledgeIndexBackoffMs } from '../lib/knowledge-index-worker';
import { notificationBackoffMs } from '../lib/notification-outbox';
import { TestNotificationProvider } from '../lib/notification-providers';
import {
  CURRENT_STAGING_MIGRATION,
  loadStagingConfiguration,
  summarizeStagingConfiguration,
} from '../lib/staging-configuration';
import { createStagingProbeObjectKey } from '../lib/staging-object-storage';
import { stagingRedisKey } from '../lib/staging-redis';
import {
  inspectCriticalStagingWorkerHeartbeat,
  publishCriticalStagingWorkerHeartbeat,
} from '../lib/staging-worker-heartbeat';

function validEnvironment(): Record<string, string> {
  return {
    APP_ENV: 'staging',
    STAGING_MODE: 'local',
    NODE_ENV: 'test',
    APP_BASE_URL: 'http://web:3000',
    DATABASE_URL:
      'postgresql://staging_user:staging_password_2026@postgres:5432/avantime_staging?schema=public',
    DATABASE_APPLICATION_NAME: 'avantime-staging-test',
    DATABASE_CONNECTION_LIMIT: '10',
    DATABASE_POOL_TIMEOUT_SECONDS: '10',
    DATABASE_STATEMENT_TIMEOUT_MS: '30000',
    DATABASE_TRANSACTION_TIMEOUT_MS: '30000',
    REDIS_URL: 'redis://:staging_redis_password_2026@redis:6379/0',
    REDIS_NAMESPACE: 'avantime:staging:test',
    REDIS_REQUIRED_FOR_READINESS: 'true',
    REDIS_CONNECT_TIMEOUT_MS: '3000',
    REDIS_DEFAULT_TTL_SECONDS: '300',
    OBJECT_STORAGE_ENDPOINT: 'http://minio:9000',
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_BUCKET: 'avantime-staging-test',
    OBJECT_STORAGE_ACCESS_KEY: 'staging_access',
    OBJECT_STORAGE_SECRET_KEY: 'staging_object_secret_2026',
    OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    OBJECT_STORAGE_MAX_BYTES: '20971520',
    NOTIFICATION_PROVIDER_MODE: 'test',
    NOTIFICATION_SENDER_IDENTITY: 'staging@invalid.test',
    NOTIFICATION_MAX_ATTEMPTS: '5',
    NOTIFICATION_BATCH_SIZE: '10',
    NOTIFICATION_LEASE_MS: '10000',
    KNOWLEDGE_CACHE_DRIVER: 'redis',
    KNOWLEDGE_SEARCH_DRIVER: 'postgresql',
    KNOWLEDGE_VECTOR_DRIVER: 'pgvector',
    KNOWLEDGE_EMBEDDING_MODEL: 'deterministic-staging-v1',
    KNOWLEDGE_EMBEDDING_VERSION: 'staging-v1',
    SESSION_SECRET: 'staging-session-secret-with-at-least-32-chars',
    MFA_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    AUDIT_INTEGRITY_KEY: 'staging-audit-secret-with-at-least-32-chars',
    JIRA_INTEGRATION_ENABLED: 'true',
    JIRA_MODE: 'test',
    JIRA_BASE_URL: 'https://jira.test.invalid',
    JIRA_PROJECT_KEY: 'TEST',
    JIRA_ISSUE_TYPE: 'Task',
    JIRA_REQUEST_TIMEOUT_MS: '5000',
    JIRA_MAX_ATTEMPTS: '3',
    JIRA_BATCH_SIZE: '10',
    JIRA_LEASE_MS: '5000',
    JIRA_POLL_INTERVAL_MS: '250',
    JIRA_WORKER_ID: 'jira-staging-test',
    JIRA_WEBHOOK_MODE: 'test',
    JIRA_WEBHOOK_SECRET: 'staging-test-webhook-secret-at-least-32-characters',
    JIRA_WEBHOOK_ALLOWED_ORIGIN: 'https://jira.test.invalid',
    JIRA_WEBHOOK_TIMEOUT_MS: '5000',
    JIRA_WEBHOOK_REPLAY_WINDOW_MS: '300000',
    JIRA_WEBHOOK_MAX_PAYLOAD_BYTES: '262144',
    JIRA_WEBHOOK_ENABLED_EVENTS:
      'jira:issue_updated,jira:issue_deleted,comment_created,comment_updated',
    JIRA_INBOUND_MAX_ATTEMPTS: '3',
    JIRA_INBOUND_BATCH_SIZE: '10',
    JIRA_INBOUND_LEASE_MS: '5000',
    JIRA_INBOUND_POLL_INTERVAL_MS: '250',
    JIRA_INBOUND_RETENTION_DAYS: '30',
    JIRA_INBOUND_WORKER_ID: 'jira-inbound-staging-test',
    APP_VERSION: '2.0-test',
    COMMIT_SHA: 'abcdef1234567',
    MIGRATION_VERSION: CURRENT_STAGING_MIGRATION,
    DEPLOYMENT_GENERATION: 'staging-test-1',
    BACKUP_DESTINATION_REFERENCE: 'test:isolated-backup',
    BACKUP_DRIVER: 'local',
    BACKUP_RETENTION_DAYS: '7',
    OTEL_SERVICE_NAME: 'avantime-staging-test',
    DOCUMENT_STORAGE_DRIVER: 's3',
    DOCUMENT_METADATA_DRIVER: 'postgresql',
    DOCUMENT_PROCESSING_QUEUE_DRIVER: 'external',
    DOCUMENT_PROCESSING_QUEUE_NAME: 'staging-test-document',
    DOCUMENT_WORKER_TENANT_ID: 'staging-system',
    DOCUMENT_WORKER_ID: 'document-staging-test-1',
    WORKER_VERSION: '2.0-test',
    DOCUMENT_OCR_DRIVER: 'disabled',
    DOCUMENT_OCR_REQUIRED_FOR_READINESS: 'false',
    DOCUMENT_EMBEDDING_DRIVER: 'fake',
    DOCUMENT_EMBEDDING_MODEL: 'deterministic-staging-v1',
    DOCUMENT_EMBEDDING_VERSION: 'staging-v1',
    DOCUMENT_EMBEDDING_QUEUE_DRIVER: 'redis',
    DOCUMENT_VECTOR_DRIVER: 'pgvector',
    RAG_ANSWER_DRIVER: 'fake',
    DOCUMENT_RAG_REQUIRED_FOR_READINESS: 'true',
  };
}

test('staging configuration validates the isolated contract and returns a redacted summary', () => {
  const configuration = loadStagingConfiguration(validEnvironment());
  assert.equal(configuration.appEnvironment, 'staging');
  assert.equal(configuration.redis.namespace, 'avantime:staging:test');
  const summary = summarizeStagingConfiguration(configuration);
  assert.equal(summary.valid, true);
  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(
    serialized,
    /staging_password_2026|staging_object_secret_2026|session-secret/u,
  );
});

test('staging configuration has no development fallback and rejects defaults or shared resources', () => {
  const missingEnvironment = validEnvironment();
  delete missingEnvironment.APP_ENV;
  assert.throws(() => loadStagingConfiguration(missingEnvironment), /APP_ENV_REQUIRED/u);

  const placeholder = validEnvironment();
  placeholder.SESSION_SECRET = '<secret-store-reference>';
  assert.throws(() => loadStagingConfiguration(placeholder), /PLACEHOLDER/u);

  const productionDatabase = validEnvironment();
  productionDatabase.DATABASE_URL =
    'postgresql://user:strong_password_2026@postgres:5432/avantime_production';
  assert.throws(() => loadStagingConfiguration(productionDatabase), /NAME_NOT_STAGING/u);

  const jiraCredentials = validEnvironment();
  jiraCredentials.JIRA_API_TOKEN = 'must-not-be-present';
  assert.throws(() => loadStagingConfiguration(jiraCredentials), /TEST_CREDENTIALS_DENIED/u);

  const jiraWebhookTenantMismatch = validEnvironment();
  jiraWebhookTenantMismatch.JIRA_WEBHOOK_ALLOWED_ORIGIN = 'https://foreign.test.invalid';
  assert.throws(
    () => loadStagingConfiguration(jiraWebhookTenantMismatch),
    /JIRA_WEBHOOK_ORIGIN_MISMATCH/u,
  );
});

test('managed staging rejects local endpoints and test notification provider', () => {
  const environment = validEnvironment();
  environment.STAGING_MODE = 'managed';
  assert.throws(() => loadStagingConfiguration(environment), /TLS_REQUIRED/u);
});

test('managed staging rejects fake AI, disabled OCR, stale versions and non-immutable commits', () => {
  const environment = validEnvironment();
  environment.STAGING_MODE = 'managed';
  environment.APP_BASE_URL = 'https://portal.staging.avantime.invalid';
  environment.DATABASE_URL =
    'postgresql://staging_user:staging_password_2026@database.staging.avantime.invalid/avantime_staging?sslmode=require';
  environment.REDIS_URL =
    'rediss://default:staging_redis_password_2026@redis.staging.avantime.invalid:6379/0';
  environment.OBJECT_STORAGE_ENDPOINT = 'https://objects.staging.avantime.invalid';
  environment.NOTIFICATION_PROVIDER_MODE = 'resend';
  environment.RESEND_API_KEY = 'resend-staging-key-with-20-characters';
  environment.BACKUP_DRIVER = 's3';
  environment.BACKUP_STORAGE_ENDPOINT = 'https://backups.staging.avantime.invalid';
  environment.BACKUP_OBJECT_STORAGE_BUCKET = 'avantime-staging-test-backups';
  environment.JIRA_INTEGRATION_ENABLED = 'false';
  environment.JIRA_MODE = 'disabled';
  environment.JIRA_WEBHOOK_MODE = 'disabled';
  environment.COMMIT_SHA = 'a'.repeat(40);
  environment.DOCUMENT_OCR_DRIVER = 'local';
  environment.DOCUMENT_OCR_REQUIRED_FOR_READINESS = 'true';

  assert.throws(() => loadStagingConfiguration(environment), /MANAGED_RAG_RUNTIME_INVALID/u);

  environment.DOCUMENT_EMBEDDING_DRIVER = 'openai';
  environment.DOCUMENT_EMBEDDING_MODEL = 'text-embedding-3-small';
  environment.KNOWLEDGE_EMBEDDING_MODEL = 'text-embedding-3-small';
  environment.RAG_ANSWER_DRIVER = 'openai';
  environment.OPENAI_API_KEY = 'openai-staging-key-with-20-characters';
  assert.equal(loadStagingConfiguration(environment).mode, 'managed');

  environment.MIGRATION_VERSION = '20260803180000_jira_status_comment_sync';
  assert.throws(() => loadStagingConfiguration(environment), /MIGRATION_VERSION_STALE/u);
  environment.MIGRATION_VERSION = CURRENT_STAGING_MIGRATION;
  environment.COMMIT_SHA = 'local-validation';
  assert.throws(() => loadStagingConfiguration(environment), /COMMIT_SHA_INVALID/u);
  environment.COMMIT_SHA = 'a'.repeat(40);
  environment.APP_VERSION = 'task-016-local';
  environment.WORKER_VERSION = 'task-016-local';
  assert.throws(() => loadStagingConfiguration(environment), /APP_VERSION_STALE/u);
});

test('critical staging worker heartbeat is versioned, expiring and fail-closed', async () => {
  const values = new Map<string, string>();
  const client = {
    async sendCommand(args: string[]) {
      const [command, key, value] = args;
      if (command === 'SET') {
        values.set(key!, value!);
        return 'OK';
      }
      if (command === 'GET') return values.get(key!) ?? null;
      throw new Error('unsupported');
    },
  };
  const configuration = loadStagingConfiguration(validEnvironment());
  const now = new Date('2026-09-02T12:00:00.000Z');
  await publishCriticalStagingWorkerHeartbeat({
    client,
    configuration,
    worker: 'document',
    workerVersion: configuration.versions.application,
    now,
  });
  assert.equal(
    (
      await inspectCriticalStagingWorkerHeartbeat({
        client,
        configuration,
        worker: 'document',
        now,
      })
    ).ready,
    true,
  );
  assert.equal(
    (
      await inspectCriticalStagingWorkerHeartbeat({
        client,
        configuration,
        worker: 'document',
        now: new Date(now.getTime() + 121_000),
      })
    ).ready,
    false,
  );
  assert.equal(
    (
      await inspectCriticalStagingWorkerHeartbeat({
        client,
        configuration,
        worker: 'embedding',
        now,
      })
    ).ready,
    false,
  );
});

test('Redis keys separate staging areas and tenants', () => {
  const first = stagingRedisKey({
    namespace: 'avantime:staging:a',
    area: 'cache',
    tenantId: 'tenant-a',
    resource: 'article-1',
  });
  const second = stagingRedisKey({
    namespace: 'avantime:staging:a',
    area: 'session',
    tenantId: 'tenant-b',
    resource: 'article-1',
  });
  assert.notEqual(first, second);
  assert.throws(() =>
    stagingRedisKey({
      namespace: 'avantime:production:a',
      area: 'cache',
      tenantId: 'tenant-a',
      resource: 'article-1',
    }),
  );
});

test('object storage probes use unique tenant-fenced keys', () => {
  const first = createStagingProbeObjectKey('staging', 'tenant-a');
  const second = createStagingProbeObjectKey('staging', 'tenant-a');
  assert.match(first, /^staging\/tenant-a\/readiness\//u);
  assert.notEqual(first, second);
  assert.throws(() => createStagingProbeObjectKey('production', 'tenant-a'));
  assert.throws(() => createStagingProbeObjectKey('staging', '../tenant'));
});

test('outbox and indexing retries are exponential and bounded', () => {
  assert.deepEqual(
    [1, 2, 3, 20].map((attempt) => notificationBackoffMs(attempt)),
    [1_000, 2_000, 4_000, 300_000],
  );
  assert.deepEqual(
    [1, 2, 3, 20].map((attempt) => knowledgeIndexBackoffMs(attempt)),
    [1_000, 2_000, 4_000, 300_000],
  );
  assert.throws(() => notificationBackoffMs(0));
  assert.throws(() => knowledgeIndexBackoffMs(21));
});

test('test notification adapter is idempotent and exposes only safe receipt IDs', async () => {
  const provider = new TestNotificationProvider();
  const record = {
    id: 'outbox-1',
    idempotencyKey: 'notification:test:1',
    notificationType: 'TEST',
    recipientReference: 'synthetic:recipient-1',
    recipientUserId: null,
    templateReference: 'test-v1',
    correlationId: 'correlation-1',
    status: 'PROCESSING' as const,
    attempts: 1,
    maxAttempts: 3,
    nextAttemptAt: new Date(),
    leaseToken: 'lease-1',
    leaseUntil: new Date(),
    providerMessageId: null,
    lastFailureCode: null,
    deliveredAt: null,
  };
  const first = await provider.deliver(record);
  const second = await provider.deliver({ ...record, attempts: 2 });
  assert.deepEqual(first, second);
  assert.equal(first.terminal, 'delivered');
  assert.doesNotMatch(first.providerMessageId, /@/u);
});

const article: KnowledgeIndexDocument = {
  articleId: 'article-1',
  slug: 'article-1',
  sourceVersion: 2,
  generation: 2,
  ownerScope: 'ORGANIZATION',
  companyId: 'tenant-a',
  visibility: 'ORGANIZATION',
  lifecycleStatus: 'PUBLISHED',
  title: 'Title',
  summary: 'Summary',
  tags: ['tag'],
  searchText: 'Title Summary',
};

test('knowledge audience fencing denies foreign tenants, private and archived versions', () => {
  assert.equal(
    canReadKnowledgeIndex(article, { kind: 'ORGANIZATION', companyId: 'tenant-a' }),
    true,
  );
  assert.equal(
    canReadKnowledgeIndex(article, { kind: 'ORGANIZATION', companyId: 'tenant-b' }),
    false,
  );
  assert.equal(canReadKnowledgeIndex(article, { kind: 'PUBLIC' }), false);
  assert.equal(
    canReadKnowledgeIndex(
      { ...article, ownerScope: 'PLATFORM', companyId: null, visibility: 'PLATFORM' },
      { kind: 'ORGANIZATION', companyId: 'tenant-b' },
    ),
    true,
  );
  assert.equal(
    canReadKnowledgeIndex({ ...article, visibility: 'PUBLIC' }, { kind: 'PUBLIC' }),
    true,
  );
  assert.equal(
    canReadKnowledgeIndex({ ...article, visibility: 'PRIVATE' }, { kind: 'PLATFORM' }),
    false,
  );
  for (const lifecycleStatus of ['DRAFT', 'REVIEW', 'ARCHIVED'] as const) {
    assert.equal(
      canReadKnowledgeIndex(
        { ...article, lifecycleStatus },
        { kind: 'ORGANIZATION', companyId: 'tenant-a' },
      ),
      false,
    );
  }
  assert.equal(
    canReadKnowledgeIndex(
      { ...article, lifecycleStatus: 'ARCHIVED' },
      { kind: 'ORGANIZATION', companyId: 'tenant-a' },
    ),
    false,
  );
});

test('knowledge cache key includes environment, tenant, resource and exact source version', async () => {
  const values = new Map<string, string>();
  const client = {
    async sendCommand(args: string[]) {
      const [command, key, value] = args;
      if (command === 'SET') {
        values.set(key!, value!);
        return 'OK';
      }
      if (command === 'GET') return values.get(key!) ?? null;
      if (command === 'DEL') {
        for (const item of args.slice(1)) values.delete(item);
        return 1;
      }
      if (command === 'SCAN') return ['0', []];
      throw new Error('unsupported');
    },
  };
  const cache = new RedisKnowledgeCacheAdapter(client, 'avantime:staging:test', 60);
  await cache.put(article);
  assert.match(cache.key(article), /avantime:staging:test:cache:tenant-a:knowledge-article-1-v2/u);
  assert.equal((await cache.get(article))?.sourceVersion, 2);
  assert.equal(await cache.get({ ...article, sourceVersion: 3 }), null);
});
