import { randomUUID } from 'node:crypto';

import { getPrisma } from '@avantime/database';

import {
  PostgreSQLKnowledgeSearchAdapter,
  PostgreSQLKnowledgeVectorAdapter,
} from '../lib/knowledge-indexing';
import { processKnowledgeIndexBatch } from '../lib/knowledge-index-worker';
import { enqueueNotification, processNotificationBatch } from '../lib/notification-outbox';
import { TestNotificationProvider } from '../lib/notification-providers';
import { createRedisCommandClient } from '../lib/redis-lease-queue';
import { loadStagingConfiguration } from '../lib/staging-configuration';
import { probeStagingObjectStorage } from '../lib/staging-object-storage';
import { probeStagingRedis } from '../lib/staging-redis';
import { RedisKnowledgeCacheAdapter } from '../lib/knowledge-indexing';

async function expectHttp(baseUrl: string, path: string, expected: number) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== expected) {
    throw new Error(`SMOKE_HTTP_${path.replaceAll('/', '_').toUpperCase()}_${response.status}`);
  }
}

async function main() {
  const configuration = loadStagingConfiguration();
  const baseUrl = process.env.STAGING_SMOKE_BASE_URL ?? configuration.baseUrl.toString();
  const correlationId = `smoke-${randomUUID()}`;
  const prisma = await getPrisma();
  if (!prisma) throw new Error('SMOKE_DATABASE_UNAVAILABLE');
  const redis = await createRedisCommandClient(configuration.redis.url.toString(), {
    connectTimeoutMs: configuration.redis.connectTimeoutMs,
  });
  const cache = new RedisKnowledgeCacheAdapter(
    redis,
    configuration.redis.namespace,
    configuration.redis.defaultTtlSeconds,
  );
  const companyId = `smoke-company-${randomUUID()}`;
  const articleId = `smoke-article-${randomUUID()}`;
  const notificationKey = `smoke:${randomUUID()}`;
  try {
    await expectHttp(baseUrl, '/health', 200);
    await expectHttp(baseUrl, '/ready', 200);
    await expectHttp(baseUrl, '/portal/login', 200);
    await expectHttp(baseUrl, '/api/requests', 401);

    const database = await prisma.$queryRaw<Array<{ ready: number }>>`SELECT 1::INTEGER AS "ready"`;
    if (database[0]?.ready !== 1) throw new Error('SMOKE_DATABASE_QUERY_FAILED');
    await probeStagingRedis(redis, configuration.redis.namespace, correlationId);
    await probeStagingObjectStorage(configuration.objectStorage);

    await enqueueNotification({
      idempotencyKey: notificationKey,
      notificationType: 'STAGING_SMOKE',
      recipientReference: `synthetic:${correlationId}`,
      templateReference: 'staging-smoke-v1',
      correlationId,
      maximumAttempts: 3,
    });
    await processNotificationBatch({
      provider: new TestNotificationProvider(),
      batchSize: 10,
      leaseMs: configuration.notifications.leaseMs,
      correlationId,
    });
    const notification = await prisma.notificationOutbox.findUnique({
      where: { idempotencyKey: notificationKey },
    });
    if (notification?.status !== 'DELIVERED') throw new Error('SMOKE_NOTIFICATION_NOT_DELIVERED');

    await prisma.company.create({ data: { id: companyId, name: 'TASK-015 staging smoke' } });
    await prisma.knowledgeArticle.create({
      data: {
        id: articleId,
        slug: articleId,
        title: 'Synthetic staging knowledge',
        summary: 'TASK-015 isolated smoke record',
        category: 'staging-smoke',
        tags: ['synthetic', 'task-015'],
        content: [{ title: 'Smoke', paragraphs: ['Synthetic content only.'] }],
        status: 'PUBLISHED',
        ownerScope: 'ORGANIZATION',
        companyId,
        visibility: 'ORGANIZATION',
        version: 1,
        classificationEvidence: 'task-015-staging-smoke-v1',
        publishedAt: new Date(),
      },
    });
    await processKnowledgeIndexBatch({
      batchSize: 10,
      leaseMs: configuration.notifications.leaseMs,
      cache,
      articleId,
    });
    const search = new PostgreSQLKnowledgeSearchAdapter();
    const vectors = new PostgreSQLKnowledgeVectorAdapter();
    const ownResults = await search.search('Synthetic staging knowledge', {
      kind: 'ORGANIZATION',
      companyId,
    });
    const foreignResults = await search.search('Synthetic staging knowledge', {
      kind: 'ORGANIZATION',
      companyId: `foreign-${randomUUID()}`,
    });
    const ownVector = await vectors.getForAudience(articleId, {
      kind: 'ORGANIZATION',
      companyId,
    });
    const foreignVector = await vectors.getForAudience(articleId, {
      kind: 'ORGANIZATION',
      companyId: `foreign-${randomUUID()}`,
    });
    if (!ownResults.some((row) => row.articleId === articleId) || !ownVector) {
      throw new Error('SMOKE_KNOWLEDGE_INDEX_MISSING');
    }
    if (foreignResults.some((row) => row.articleId === articleId) || foreignVector) {
      throw new Error('SMOKE_KNOWLEDGE_TENANT_ISOLATION_FAILED');
    }

    await prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: { status: 'ARCHIVED', version: { increment: 1 } },
    });
    await processKnowledgeIndexBatch({
      batchSize: 10,
      leaseMs: configuration.notifications.leaseMs,
      cache,
      articleId,
    });
    const archived = await search.search('Synthetic staging knowledge', {
      kind: 'ORGANIZATION',
      companyId,
    });
    if (archived.some((row) => row.articleId === articleId)) {
      throw new Error('SMOKE_ARCHIVED_KNOWLEDGE_RETRIEVABLE');
    }

    console.info(
      JSON.stringify({
        status: 'passed',
        correlationId,
        checks: [
          'health',
          'readiness',
          'login',
          'unauthorized-api',
          'database',
          'redis',
          'object-storage',
          'notification-outbox',
          'knowledge-versioning',
          'tenant-isolation',
          'archive-removal',
        ],
      }),
    );
  } finally {
    await prisma.knowledgeIndexEvent.deleteMany({ where: { articleId } }).catch(() => undefined);
    await prisma.knowledgeSearchIndex.deleteMany({ where: { articleId } }).catch(() => undefined);
    await prisma.knowledgeVectorIndex.deleteMany({ where: { articleId } }).catch(() => undefined);
    await prisma.knowledgeArticle.deleteMany({ where: { id: articleId } }).catch(() => undefined);
    await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => undefined);
    await prisma.notificationOutbox
      .deleteMany({ where: { idempotencyKey: notificationKey } })
      .catch(() => undefined);
    await redis.close?.();
  }
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      code: error instanceof Error ? error.message : 'STAGING_SMOKE_FAILED',
    }),
  );
  process.exitCode = 1;
});
