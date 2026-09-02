import assert from 'node:assert/strict';
import test from 'node:test';

import type { PrismaClient } from '@prisma/client';

import {
  PostgreSQLKnowledgeSearchAdapter,
  PostgreSQLKnowledgeVectorAdapter,
  RedisKnowledgeCacheAdapter,
  requestPlatformKnowledgeReindex,
} from '../../lib/knowledge-indexing';
import {
  claimKnowledgeIndexBatch,
  processKnowledgeIndexBatch,
} from '../../lib/knowledge-index-worker';
import {
  enqueueNotification,
  processNotificationBatch,
  type NotificationDelivery,
  type NotificationProviderAdapter,
} from '../../lib/notification-outbox';
import { TestNotificationProvider } from '../../lib/notification-providers';
import { createRedisCommandClient } from '../../lib/redis-lease-queue';
import { integrationDatabase } from './integration-test-environment';

const OUTBOX_POLL_TIMEOUT_MS = 2_000;
const OUTBOX_POLL_INTERVAL_MS = 25;

async function waitForNotificationStatus(
  prisma: PrismaClient,
  idempotencyKey: string,
  expectedStatus: 'DELIVERED' | 'FAILED' | 'DEAD_LETTER',
) {
  const deadline = Date.now() + OUTBOX_POLL_TIMEOUT_MS;
  let current: {
    status: string;
    attempts: number;
    nextAttemptAt: Date;
    leaseUntil: Date | null;
    providerMessageId: string | null;
    lastFailureCode: string | null;
  } | null = null;

  do {
    current = await prisma.notificationOutbox.findUnique({
      where: { idempotencyKey },
      select: {
        status: true,
        attempts: true,
        nextAttemptAt: true,
        leaseUntil: true,
        providerMessageId: true,
        lastFailureCode: true,
      },
    });
    if (current?.status === expectedStatus) return current;
    if (Date.now() >= deadline) break;
    await new Promise<void>((resolve) => setTimeout(resolve, OUTBOX_POLL_INTERVAL_MS));
  } while (Date.now() < deadline);

  assert.fail(
    `Notification ${idempotencyKey} did not reach ${expectedStatus}: ${JSON.stringify({
      status: current?.status ?? null,
      attemptCount: current?.attempts ?? null,
      nextAttemptAt: current?.nextAttemptAt.toISOString() ?? null,
      leaseUntil: current?.leaseUntil?.toISOString() ?? null,
      providerMessageId: current?.providerMessageId ?? null,
      lastErrorCode: current?.lastFailureCode ?? null,
    })}`,
  );
}

function nextEligibleTime(record: { nextAttemptAt: Date }) {
  return new Date(record.nextAttemptAt.getTime() + 1);
}

test('notification outbox claims concurrently without double delivery and reaches retry/DLQ states', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const runId = crypto.randomUUID();
  const deliveryCorrelationId = `staging-outbox-delivery-${runId}`;
  const retryCorrelationId = `staging-outbox-retry-${runId}`;
  const deadLetterCorrelationId = `staging-outbox-dead-${runId}`;
  const correlationIds = [deliveryCorrelationId, retryCorrelationId, deadLetterCorrelationId];
  try {
    const deliveryKeys = Array.from(
      { length: 6 },
      (_, index) => `staging-outbox-delivery-${runId}:${index}`,
    );
    await Promise.all(
      deliveryKeys.map((idempotencyKey, index) =>
        enqueueNotification({
          idempotencyKey,
          notificationType: 'INTEGRATION_TEST',
          recipientReference: `synthetic:${runId}:delivery:${index}`,
          templateReference: 'integration-v1',
          correlationId: deliveryCorrelationId,
        }),
      ),
    );

    const testProvider = new TestNotificationProvider();
    const deliveryCalls = new Map<string, number>();
    const providerResults: NotificationDelivery[] = [];
    const recordingProvider: NotificationProviderAdapter = {
      kind: 'test',
      checkReadiness: () => testProvider.checkReadiness(),
      deliver: async (record) => {
        deliveryCalls.set(
          record.idempotencyKey,
          (deliveryCalls.get(record.idempotencyKey) ?? 0) + 1,
        );
        const result = await testProvider.deliver(record);
        providerResults.push(result);
        return result;
      },
    };
    const workers = await Promise.all([
      processNotificationBatch({
        provider: recordingProvider,
        batchSize: 3,
        leaseMs: 5_000,
        correlationId: deliveryCorrelationId,
      }),
      processNotificationBatch({
        provider: recordingProvider,
        batchSize: 3,
        leaseMs: 5_000,
        correlationId: deliveryCorrelationId,
      }),
    ]);
    assert.equal(
      workers.reduce((total, worker) => total + worker.claimed, 0),
      6,
    );
    assert.equal(
      workers.reduce((total, worker) => total + worker.delivered, 0),
      6,
    );
    assert.equal(
      workers.reduce((total, worker) => total + worker.failed + worker.deadLettered, 0),
      0,
    );
    const deliveredRecords = await Promise.all(
      deliveryKeys.map((idempotencyKey) =>
        waitForNotificationStatus(prisma, idempotencyKey, 'DELIVERED'),
      ),
    );
    assert.equal(providerResults.length, 6);
    assert.equal(
      providerResults.every((result) => result.terminal === 'delivered'),
      true,
    );
    assert.equal(new Set(providerResults.map((result) => result.providerMessageId)).size, 6);
    assert.deepEqual(
      deliveryKeys.map((idempotencyKey) => deliveryCalls.get(idempotencyKey)),
      Array.from({ length: 6 }, () => 1),
    );
    assert.equal(
      deliveredRecords.every((record) => record.attempts === 1),
      true,
    );
    assert.equal(
      deliveredRecords.every((record) => record.leaseUntil === null),
      true,
    );
    assert.equal(
      deliveredRecords.every((record) => record.providerMessageId !== null),
      true,
    );
    assert.equal(
      deliveredRecords.every((record) => record.lastFailureCode === null),
      true,
    );

    const retryKey = `staging-outbox-retry-${runId}`;
    const retryRecord = await enqueueNotification({
      idempotencyKey: retryKey,
      notificationType: 'INTEGRATION_RETRY',
      recipientReference: `synthetic:${runId}:retry`,
      templateReference: 'integration-v1',
      correlationId: retryCorrelationId,
      maximumAttempts: 3,
    });
    const retryProvider = new TestNotificationProvider(2);
    const firstRetryResult = await processNotificationBatch({
      provider: retryProvider,
      batchSize: 1,
      leaseMs: 5_000,
      now: nextEligibleTime(retryRecord),
      correlationId: retryCorrelationId,
    });
    assert.deepEqual(firstRetryResult, { claimed: 1, delivered: 0, failed: 1, deadLettered: 0 });
    const firstFailure = await waitForNotificationStatus(prisma, retryKey, 'FAILED');
    assert.equal(firstFailure.attempts, 1);
    assert.equal(firstFailure.leaseUntil, null);
    assert.equal(firstFailure.lastFailureCode, 'TEST_PROVIDER_REJECTED');

    const secondRetryResult = await processNotificationBatch({
      provider: retryProvider,
      batchSize: 1,
      leaseMs: 5_000,
      now: nextEligibleTime(firstFailure),
      correlationId: retryCorrelationId,
    });
    assert.deepEqual(secondRetryResult, { claimed: 1, delivered: 0, failed: 1, deadLettered: 0 });
    const secondFailure = await waitForNotificationStatus(prisma, retryKey, 'FAILED');
    assert.equal(secondFailure.attempts, 2);
    assert.equal(secondFailure.leaseUntil, null);
    assert.equal(secondFailure.lastFailureCode, 'TEST_PROVIDER_REJECTED');

    const finalRetryResult = await processNotificationBatch({
      provider: retryProvider,
      batchSize: 1,
      leaseMs: 5_000,
      now: nextEligibleTime(secondFailure),
      correlationId: retryCorrelationId,
    });
    assert.deepEqual(finalRetryResult, { claimed: 1, delivered: 1, failed: 0, deadLettered: 0 });
    const retriedDelivery = await waitForNotificationStatus(prisma, retryKey, 'DELIVERED');
    assert.equal(retriedDelivery.attempts, 3);
    assert.equal(retriedDelivery.leaseUntil, null);
    assert.match(retriedDelivery.providerMessageId ?? '', /^test:/u);
    assert.equal(retriedDelivery.lastFailureCode, null);

    const deadKey = `staging-outbox-dead-${runId}`;
    const deadRecord = await enqueueNotification({
      idempotencyKey: deadKey,
      notificationType: 'INTEGRATION_DLQ',
      recipientReference: `synthetic:${runId}:dead`,
      templateReference: 'integration-v1',
      correlationId: deadLetterCorrelationId,
      maximumAttempts: 2,
    });
    const rejecting = new TestNotificationProvider(20);
    const firstDeadLetterResult = await processNotificationBatch({
      provider: rejecting,
      batchSize: 1,
      leaseMs: 5_000,
      now: nextEligibleTime(deadRecord),
      correlationId: deadLetterCorrelationId,
    });
    assert.deepEqual(firstDeadLetterResult, {
      claimed: 1,
      delivered: 0,
      failed: 1,
      deadLettered: 0,
    });
    const deadLetterFailure = await waitForNotificationStatus(prisma, deadKey, 'FAILED');
    assert.equal(deadLetterFailure.attempts, 1);
    assert.equal(deadLetterFailure.leaseUntil, null);
    assert.equal(deadLetterFailure.lastFailureCode, 'TEST_PROVIDER_REJECTED');

    const finalDeadLetterResult = await processNotificationBatch({
      provider: rejecting,
      batchSize: 1,
      leaseMs: 5_000,
      now: nextEligibleTime(deadLetterFailure),
      correlationId: deadLetterCorrelationId,
    });
    assert.deepEqual(finalDeadLetterResult, {
      claimed: 1,
      delivered: 0,
      failed: 0,
      deadLettered: 1,
    });
    const deadLettered = await waitForNotificationStatus(prisma, deadKey, 'DEAD_LETTER');
    assert.equal(deadLettered.attempts, 2);
    assert.equal(deadLettered.leaseUntil, null);
    assert.equal(deadLettered.providerMessageId, null);
    assert.equal(deadLettered.lastFailureCode, 'TEST_PROVIDER_REJECTED');
  } finally {
    await prisma.notificationOutbox.deleteMany({
      where: { correlationId: { in: correlationIds } },
    });
  }
});

test('knowledge publish, update, archive and delete lifecycle fences PostgreSQL search/pgvector', async () => {
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
      data: {
        title: 'Updated staging indexing contract',
        summary: 'Updated synthetic integration article',
        content: [{ title: 'Updated', paragraphs: ['Updated synthetic content.'] }],
        version: { increment: 1 },
      },
    });
    await processKnowledgeIndexBatch({ batchSize: 100, leaseMs: 5_000, cache, articleId });
    const updatedSearch = await prisma.knowledgeSearchIndex.findUnique({ where: { articleId } });
    const updatedVector = await prisma.knowledgeVectorIndex.findUnique({ where: { articleId } });
    assert.equal(updatedSearch?.sourceVersion, 2);
    assert.equal(updatedVector?.sourceVersion, 2);
    assert.equal(updatedVector?.generation, 2);
    assert.ok(updatedVector?.embeddingModel);
    assert.ok(updatedVector?.embeddingVersion);
    assert.deepEqual(
      await processKnowledgeIndexBatch({ batchSize: 100, leaseMs: 5_000, cache, articleId }),
      { claimed: 0, completed: 0, failed: 0, deadLettered: 0 },
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

    await prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: { status: 'PUBLISHED', version: { increment: 1 } },
    });
    await processKnowledgeIndexBatch({ batchSize: 100, leaseMs: 5_000, cache, articleId });
    assert.ok(await prisma.knowledgeSearchIndex.findUnique({ where: { articleId } }));
    await prisma.knowledgeArticle.delete({ where: { id: articleId } });
    assert.ok(
      await prisma.knowledgeIndexEvent.findUnique({
        where: { idempotencyKey: `knowledge:${articleId}:4:delete` },
      }),
    );
    await processKnowledgeIndexBatch({ batchSize: 100, leaseMs: 5_000, cache, articleId });
    assert.equal(await prisma.knowledgeSearchIndex.findUnique({ where: { articleId } }), null);
    assert.equal(await prisma.knowledgeVectorIndex.findUnique({ where: { articleId } }), null);
  } finally {
    await prisma.knowledgeArticle.deleteMany({ where: { id: articleId } });
    await prisma.knowledgeIndexEvent.deleteMany({ where: { articleId } });
    await prisma.knowledgeSearchIndex.deleteMany({ where: { articleId } });
    await prisma.knowledgeVectorIndex.deleteMany({ where: { articleId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await redis.close?.();
  }
});

test('knowledge indexing dead letter quarantines the current article version', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const redis = await createRedisCommandClient(process.env.REDIS_URL!);
  const cache = new RedisKnowledgeCacheAdapter(redis, 'avantime:staging:integration', 60);
  const companyId = `staging-quarantine-company-${crypto.randomUUID()}`;
  const articleId = `staging-quarantine-article-${crypto.randomUUID()}`;
  const search = new PostgreSQLKnowledgeSearchAdapter();
  try {
    await prisma.company.create({
      data: { id: companyId, name: 'Staging quarantine integration' },
    });
    await prisma.knowledgeArticle.create({
      data: {
        id: articleId,
        slug: articleId,
        title: 'Quarantine indexing contract',
        summary: 'Synthetic quarantine article',
        category: 'integration',
        content: [{ title: 'Synthetic', paragraphs: ['No customer content.'] }],
        status: 'PUBLISHED',
        ownerScope: 'ORGANIZATION',
        companyId,
        visibility: 'ORGANIZATION',
        version: 1,
        classificationEvidence: 'task-018-integration-v1',
        publishedAt: new Date(),
      },
    });
    await processKnowledgeIndexBatch({ batchSize: 100, leaseMs: 5_000, cache, articleId });
    await prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: { summary: 'Changed content that must be reindexed', version: { increment: 1 } },
    });
    await prisma.knowledgeIndexEvent.update({
      where: { idempotencyKey: `knowledge:${articleId}:2` },
      data: { maxAttempts: 1 },
    });
    const failed = await processKnowledgeIndexBatch({
      batchSize: 100,
      leaseMs: 5_000,
      cache,
      articleId,
      search: {
        upsert: async () => {
          throw new Error('SYNTHETIC_INDEX_FAILURE');
        },
      } as unknown as PostgreSQLKnowledgeSearchAdapter,
    });
    assert.deepEqual(failed, { claimed: 1, completed: 0, failed: 0, deadLettered: 1 });
    const article = await prisma.knowledgeArticle.findUnique({ where: { id: articleId } });
    const event = await prisma.knowledgeIndexEvent.findUnique({
      where: { idempotencyKey: `knowledge:${articleId}:2` },
    });
    assert.ok(article?.quarantinedAt);
    assert.equal(event?.status, 'DEAD_LETTER');
    assert.equal(event?.lastFailureCode, 'KNOWLEDGE_INDEX_OPERATION_FAILED');
    assert.equal(
      (
        await search.search('Quarantine indexing contract', {
          kind: 'ORGANIZATION',
          companyId,
        })
      ).some((row) => row.articleId === articleId),
      false,
    );
  } finally {
    await prisma.knowledgeArticle.deleteMany({ where: { id: articleId } });
    await prisma.knowledgeIndexEvent.deleteMany({ where: { articleId } });
    await prisma.knowledgeSearchIndex.deleteMany({ where: { articleId } });
    await prisma.knowledgeVectorIndex.deleteMany({ where: { articleId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await redis.close?.();
  }
});

test('manual platform reindex advances the source version without stealing an active lease', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const articleId = `platform-reindex-article-${crypto.randomUUID()}`;
  const correlationId = `platform-reindex-${crypto.randomUUID()}`;
  try {
    await prisma.knowledgeArticle.create({
      data: {
        id: articleId,
        slug: articleId,
        title: 'Platform reindex contract',
        summary: 'Synthetic platform reindex article',
        category: 'integration',
        content: [{ title: 'Synthetic', paragraphs: ['No customer content.'] }],
        status: 'PUBLISHED',
        ownerScope: 'PLATFORM',
        companyId: null,
        visibility: 'PLATFORM',
        version: 1,
        classificationEvidence: 'task-018-reindex-v1',
        publishedAt: new Date(),
      },
    });
    const leaseUntil = new Date(Date.now() + 60_000);
    await prisma.knowledgeIndexEvent.update({
      where: { idempotencyKey: `knowledge:${articleId}:1` },
      data: {
        status: 'PROCESSING',
        attempts: 1,
        leaseToken: 'active-reindex-lease',
        leaseUntil,
      },
    });

    const result = await requestPlatformKnowledgeReindex({
      articleId,
      expectedVersion: 1,
      actorId: 'synthetic-platform-owner',
      correlationId,
    });
    assert.deepEqual(result, { articleId, sourceVersion: 2 });
    assert.equal(
      (await prisma.knowledgeArticle.findUnique({ where: { id: articleId } }))?.version,
      2,
    );
    const activeEvent = await prisma.knowledgeIndexEvent.findUnique({
      where: { idempotencyKey: `knowledge:${articleId}:1` },
    });
    assert.equal(activeEvent?.status, 'PROCESSING');
    assert.equal(activeEvent?.leaseToken, 'active-reindex-lease');
    assert.equal(activeEvent?.leaseUntil?.getTime(), leaseUntil.getTime());
    assert.equal(
      (
        await prisma.knowledgeIndexEvent.findUnique({
          where: { idempotencyKey: `knowledge:${articleId}:2` },
        })
      )?.status,
      'PENDING',
    );
    assert.equal(
      (
        await prisma.productionAuditEvent.findFirst({
          where: { correlationId, action: 'knowledge.reindex.requested' },
        })
      )?.targetId,
      articleId,
    );
  } finally {
    await prisma.knowledgeArticle.deleteMany({ where: { id: articleId } });
    await prisma.knowledgeIndexEvent.deleteMany({ where: { articleId } });
    await prisma.productionAuditEvent.deleteMany({ where: { correlationId } });
  }
});

test('expired final knowledge lease dead-letters the event and quarantines its current article', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const articleId = `expired-lease-article-${crypto.randomUUID()}`;
  try {
    await prisma.knowledgeArticle.create({
      data: {
        id: articleId,
        slug: articleId,
        title: 'Expired lease contract',
        summary: 'Synthetic expired lease article',
        category: 'integration',
        content: [{ title: 'Synthetic', paragraphs: ['No customer content.'] }],
        status: 'PUBLISHED',
        ownerScope: 'PLATFORM',
        companyId: null,
        visibility: 'PLATFORM',
        version: 1,
        classificationEvidence: 'task-018-expired-lease-v1',
        publishedAt: new Date(),
      },
    });
    const now = new Date();
    await prisma.knowledgeIndexEvent.update({
      where: { idempotencyKey: `knowledge:${articleId}:1` },
      data: {
        status: 'PROCESSING',
        attempts: 1,
        maxAttempts: 1,
        leaseToken: 'expired-final-lease',
        leaseUntil: new Date(now.getTime() - 1),
      },
    });

    assert.deepEqual(
      await claimKnowledgeIndexBatch({ batchSize: 1, leaseMs: 5_000, now, articleId }),
      [],
    );
    const event = await prisma.knowledgeIndexEvent.findUnique({
      where: { idempotencyKey: `knowledge:${articleId}:1` },
    });
    const article = await prisma.knowledgeArticle.findUnique({ where: { id: articleId } });
    assert.equal(event?.status, 'DEAD_LETTER');
    assert.equal(event?.lastFailureCode, 'LEASE_EXHAUSTED');
    assert.ok(article?.quarantinedAt);
  } finally {
    await prisma.knowledgeArticle.deleteMany({ where: { id: articleId } });
    await prisma.knowledgeIndexEvent.deleteMany({ where: { articleId } });
  }
});
