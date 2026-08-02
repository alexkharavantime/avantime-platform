import assert from 'node:assert/strict';
import test from 'node:test';

import type { PrismaClient } from '@prisma/client';

import {
  PostgreSQLKnowledgeSearchAdapter,
  PostgreSQLKnowledgeVectorAdapter,
  RedisKnowledgeCacheAdapter,
} from '../../lib/knowledge-indexing';
import { processKnowledgeIndexBatch } from '../../lib/knowledge-index-worker';
import {
  claimNotificationBatch,
  enqueueNotification,
  processNotificationBatch,
} from '../../lib/notification-outbox';
import { TestNotificationProvider } from '../../lib/notification-providers';
import { createRedisCommandClient } from '../../lib/redis-lease-queue';
import { integrationDatabase } from './integration-test-environment';

test('notification outbox claims concurrently without double delivery and reaches retry/DLQ states', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const prefix = `staging-outbox-${crypto.randomUUID()}`;
  try {
    for (let index = 0; index < 6; index += 1) {
      await enqueueNotification({
        idempotencyKey: `${prefix}:${index}`,
        notificationType: 'INTEGRATION_TEST',
        recipientReference: `synthetic:${index}`,
        templateReference: 'integration-v1',
        correlationId: prefix,
      });
    }
    const [first, second] = await Promise.all([
      claimNotificationBatch({ batchSize: 6, leaseMs: 5_000, correlationId: prefix }),
      claimNotificationBatch({ batchSize: 6, leaseMs: 5_000, correlationId: prefix }),
    ]);
    const claimed = [...first, ...second];
    assert.equal(claimed.length, 6);
    assert.equal(new Set(claimed.map((record) => record.id)).size, 6);

    await prisma.notificationOutbox.updateMany({
      where: { correlationId: prefix },
      data: { status: 'PENDING', attempts: 0, leaseToken: null, leaseUntil: null },
    });
    const provider = new TestNotificationProvider();
    await processNotificationBatch({
      provider,
      batchSize: 10,
      leaseMs: 5_000,
      correlationId: prefix,
    });
    assert.equal(
      await prisma.notificationOutbox.count({
        where: { correlationId: prefix, status: 'DELIVERED' },
      }),
      6,
    );

    const retryKey = `${prefix}:retry`;
    await enqueueNotification({
      idempotencyKey: retryKey,
      notificationType: 'INTEGRATION_RETRY',
      recipientReference: 'synthetic:retry',
      templateReference: 'integration-v1',
      correlationId: prefix,
      maximumAttempts: 3,
    });
    const retryProvider = new TestNotificationProvider(2);
    const start = new Date('2026-08-02T12:00:00.000Z');
    await processNotificationBatch({
      provider: retryProvider,
      batchSize: 100,
      leaseMs: 5_000,
      now: start,
      correlationId: prefix,
    });
    await processNotificationBatch({
      provider: retryProvider,
      batchSize: 100,
      leaseMs: 5_000,
      now: new Date(start.getTime() + 1_000),
      correlationId: prefix,
    });
    await processNotificationBatch({
      provider: retryProvider,
      batchSize: 100,
      leaseMs: 5_000,
      now: new Date(start.getTime() + 3_000),
      correlationId: prefix,
    });
    assert.equal(
      (await prisma.notificationOutbox.findUnique({ where: { idempotencyKey: retryKey } }))?.status,
      'DELIVERED',
    );

    const deadKey = `${prefix}:dead`;
    await enqueueNotification({
      idempotencyKey: deadKey,
      notificationType: 'INTEGRATION_DLQ',
      recipientReference: 'synthetic:dead',
      templateReference: 'integration-v1',
      correlationId: prefix,
      maximumAttempts: 2,
    });
    const rejecting = new TestNotificationProvider(20);
    await processNotificationBatch({
      provider: rejecting,
      batchSize: 100,
      leaseMs: 5_000,
      now: start,
      correlationId: prefix,
    });
    await processNotificationBatch({
      provider: rejecting,
      batchSize: 100,
      leaseMs: 5_000,
      now: new Date(start.getTime() + 1_000),
      correlationId: prefix,
    });
    assert.equal(
      (await prisma.notificationOutbox.findUnique({ where: { idempotencyKey: deadKey } }))?.status,
      'DEAD_LETTER',
    );
  } finally {
    await prisma.notificationOutbox.deleteMany({ where: { correlationId: prefix } });
  }
});

test('knowledge invalidation updates PostgreSQL search/pgvector and removes archived tenant data', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const redis = await createRedisCommandClient(process.env.REDIS_URL!);
  const cache = new RedisKnowledgeCacheAdapter(redis, 'avantime:staging:integration', 60);
  const companyId = `staging-index-company-${crypto.randomUUID()}`;
  const articleId = `staging-index-article-${crypto.randomUUID()}`;
  const search = new PostgreSQLKnowledgeSearchAdapter();
  const vectors = new PostgreSQLKnowledgeVectorAdapter();
  try {
    await prisma.company.create({ data: { id: companyId, name: 'Staging indexing integration' } });
    await prisma.knowledgeArticle.create({
      data: {
        id: articleId,
        slug: articleId,
        title: 'Unique staging indexing contract',
        summary: 'Synthetic integration article',
        category: 'integration',
        tags: ['task-015'],
        content: [{ title: 'Synthetic', paragraphs: ['No customer content.'] }],
        status: 'PUBLISHED',
        ownerScope: 'ORGANIZATION',
        companyId,
        visibility: 'ORGANIZATION',
        version: 1,
        classificationEvidence: 'task-015-integration-v1',
        publishedAt: new Date(),
      },
    });
    const queued = await prisma.knowledgeIndexEvent.findUnique({
      where: { idempotencyKey: `knowledge:${articleId}:1` },
    });
    assert.equal(queued?.status, 'PENDING');
    await processKnowledgeIndexBatch({ batchSize: 100, leaseMs: 5_000, cache, articleId });
    assert.ok(await prisma.knowledgeSearchIndex.findUnique({ where: { articleId } }));

    assert.equal(
      (
        await search.search('Unique staging indexing contract', {
          kind: 'ORGANIZATION',
          companyId,
        })
      ).some((row) => row.articleId === articleId),
      true,
    );
    assert.equal(
      (
        await search.search('Unique staging indexing contract', {
          kind: 'ORGANIZATION',
          companyId: `foreign-${crypto.randomUUID()}`,
        })
      ).some((row) => row.articleId === articleId),
      false,
    );
    assert.ok(await vectors.getForAudience(articleId, { kind: 'ORGANIZATION', companyId }));
    assert.equal(
      await vectors.getForAudience(articleId, {
        kind: 'ORGANIZATION',
        companyId: `foreign-${crypto.randomUUID()}`,
      }),
      null,
    );

    await prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: { status: 'ARCHIVED', version: { increment: 1 } },
    });
    await processKnowledgeIndexBatch({ batchSize: 100, leaseMs: 5_000, cache, articleId });
    assert.equal(
      (
        await search.search('Unique staging indexing contract', {
          kind: 'ORGANIZATION',
          companyId,
        })
      ).some((row) => row.articleId === articleId),
      false,
    );
    assert.equal(
      await vectors.getForAudience(articleId, { kind: 'ORGANIZATION', companyId }),
      null,
    );
  } finally {
    await prisma.knowledgeIndexEvent.deleteMany({ where: { articleId } });
    await prisma.knowledgeSearchIndex.deleteMany({ where: { articleId } });
    await prisma.knowledgeVectorIndex.deleteMany({ where: { articleId } });
    await prisma.knowledgeArticle.deleteMany({ where: { id: articleId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await redis.close?.();
  }
});
