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
  loadStagingConfiguration,
  summarizeStagingConfiguration,
} from '../lib/staging-configuration';
import { createStagingProbeObjectKey } from '../lib/staging-object-storage';
import { stagingRedisKey } from '../lib/staging-redis';

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
    APP_VERSION: 'task-015-test',
    COMMIT_SHA: 'abcdef1234567',
    MIGRATION_VERSION: '20260802180000_staging_baseline',
    DEPLOYMENT_GENERATION: 'staging-test-1',
    BACKUP_DESTINATION_REFERENCE: 'test:isolated-backup',
    BACKUP_DRIVER: 'local',
    BACKUP_RETENTION_DAYS: '7',
    OTEL_SERVICE_NAME: 'avantime-staging-test',
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
});

test('managed staging rejects local endpoints and test notification provider', () => {
  const environment = validEnvironment();
  environment.STAGING_MODE = 'managed';
  assert.throws(() => loadStagingConfiguration(environment), /TLS_REQUIRED/u);
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
    canReadKnowledgeIndex({ ...article, visibility: 'PRIVATE' }, { kind: 'PLATFORM' }),
    false,
  );
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
