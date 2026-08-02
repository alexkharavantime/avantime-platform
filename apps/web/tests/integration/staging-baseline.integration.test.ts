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
