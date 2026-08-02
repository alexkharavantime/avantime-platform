import { randomUUID } from 'node:crypto';

import { getPrisma } from '@avantime/database';

import { getDocumentServices } from './document-services';
import {
  knowledgeDocumentFromArticle,
  PostgreSQLKnowledgeSearchAdapter,
  PostgreSQLKnowledgeVectorAdapter,
  RedisKnowledgeCacheAdapter,
} from './knowledge-indexing';
import { createRedisCommandClient, type RedisCommandClient } from './redis-lease-queue';
import { loadStagingConfiguration } from './staging-configuration';

type KnowledgeIndexEvent = {
  id: string;
  idempotencyKey: string;
  articleId: string;
  sourceVersion: number;
  ownerScope: 'PLATFORM' | 'ORGANIZATION' | 'SYSTEM' | 'LEGACY_UNCLASSIFIED';
  companyId: string | null;
  visibility: 'PRIVATE' | 'ORGANIZATION' | 'PLATFORM' | 'PUBLIC';
  lifecycleStatus: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER';
  attempts: number;
  maxAttempts: number;
  leaseToken: string | null;
};

type KnowledgeIndexTransaction = {
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

async function knowledgeIndexDatabaseNow(prisma: {
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
}) {
  const rows = (await prisma.$queryRaw`SELECT CURRENT_TIMESTAMP AS "now"`) as Array<{ now: Date }>;
  const now = rows[0]?.now;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('KNOWLEDGE_INDEX_DATABASE_TIME_INVALID');
  }
  return now;
}

export function knowledgeIndexBackoffMs(attempt: number) {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 20) {
    throw new Error('KNOWLEDGE_INDEX_ATTEMPT_INVALID');
  }
  return Math.min(300_000, 1_000 * 2 ** (attempt - 1));
}

export async function claimKnowledgeIndexBatch(input: {
  batchSize: number;
  leaseMs: number;
  now?: Date;
  articleId?: string;
}) {
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 100) {
    throw new Error('KNOWLEDGE_INDEX_BATCH_INVALID');
  }
  const articleId = input.articleId?.trim() || null;
  if (articleId && !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,199}$/u.test(articleId)) {
    throw new Error('KNOWLEDGE_INDEX_ARTICLE_ID_INVALID');
  }
  const prisma = await getPrisma();
  if (!prisma) throw new Error('KNOWLEDGE_INDEX_DATABASE_UNAVAILABLE');
  const now = input.now ?? (await knowledgeIndexDatabaseNow(prisma));
  const leaseUntil = new Date(now.getTime() + input.leaseMs);
  const leaseToken = randomUUID();
  return prisma.$transaction(async (transaction: KnowledgeIndexTransaction) => {
    await transaction.$executeRaw`
      UPDATE "KnowledgeIndexEvent"
      SET "status" = 'DEAD_LETTER', "lastFailureCode" = 'LEASE_EXHAUSTED',
          "leaseToken" = NULL, "leaseUntil" = NULL, "updatedAt" = ${now}
      WHERE "status" = 'PROCESSING' AND "leaseUntil" <= ${now} AND "attempts" >= "maxAttempts"
    `;
    return (await transaction.$queryRaw`
      WITH candidates AS (
        SELECT "id"
        FROM "KnowledgeIndexEvent"
        WHERE "attempts" < "maxAttempts"
          AND (${articleId}::TEXT IS NULL OR "articleId" = ${articleId})
          AND (
            ("status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= ${now})
            OR ("status" = 'PROCESSING' AND "leaseUntil" <= ${now})
          )
        ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.batchSize}
      )
      UPDATE "KnowledgeIndexEvent" AS event
      SET "status" = 'PROCESSING', "attempts" = event."attempts" + 1,
          "leaseToken" = ${leaseToken}, "leaseUntil" = ${leaseUntil},
          "lastFailureCode" = NULL, "updatedAt" = ${now}
      FROM candidates
      WHERE event."id" = candidates."id"
      RETURNING event.*
    `) as KnowledgeIndexEvent[];
  });
}

export async function completeKnowledgeIndexEvent(event: KnowledgeIndexEvent, now = new Date()) {
  const prisma = await getPrisma();
  if (!prisma) throw new Error('KNOWLEDGE_INDEX_DATABASE_UNAVAILABLE');
  const result = await prisma.knowledgeIndexEvent.updateMany({
    where: { id: event.id, status: 'PROCESSING', leaseToken: event.leaseToken },
    data: {
      status: 'COMPLETED',
      completedAt: now,
      leaseToken: null,
      leaseUntil: null,
      lastFailureCode: null,
    },
  });
  if (result.count !== 1) throw new Error('KNOWLEDGE_INDEX_LEASE_LOST');
}

export async function failKnowledgeIndexEvent(
  event: KnowledgeIndexEvent,
  failureCode = 'KNOWLEDGE_INDEX_OPERATION_FAILED',
  now = new Date(),
) {
  if (!/^[A-Z0-9][A-Z0-9_-]{2,99}$/u.test(failureCode)) {
    throw new Error('KNOWLEDGE_INDEX_FAILURE_CODE_INVALID');
  }
  const prisma = await getPrisma();
  if (!prisma) throw new Error('KNOWLEDGE_INDEX_DATABASE_UNAVAILABLE');
  const exhausted = event.attempts >= event.maxAttempts;
  const result = await prisma.knowledgeIndexEvent.updateMany({
    where: { id: event.id, status: 'PROCESSING', leaseToken: event.leaseToken },
    data: {
      status: exhausted ? 'DEAD_LETTER' : 'FAILED',
      nextAttemptAt: exhausted
        ? now
        : new Date(now.getTime() + knowledgeIndexBackoffMs(event.attempts)),
      leaseToken: null,
      leaseUntil: null,
      lastFailureCode: failureCode,
    },
  });
  if (result.count !== 1) throw new Error('KNOWLEDGE_INDEX_LEASE_LOST');
}

export async function processKnowledgeIndexBatch(input: {
  batchSize: number;
  leaseMs: number;
  cache: RedisKnowledgeCacheAdapter;
  search?: PostgreSQLKnowledgeSearchAdapter;
  vectors?: PostgreSQLKnowledgeVectorAdapter;
  now?: Date;
  articleId?: string;
}) {
  const search = input.search ?? new PostgreSQLKnowledgeSearchAdapter();
  const vectors = input.vectors ?? new PostgreSQLKnowledgeVectorAdapter();
  const events = await claimKnowledgeIndexBatch(input);
  const prisma = await getPrisma();
  if (!prisma) throw new Error('KNOWLEDGE_INDEX_DATABASE_UNAVAILABLE');
  const rag = getDocumentServices().rag;
  if (!rag) throw new Error('KNOWLEDGE_INDEX_AI_GATEWAY_UNAVAILABLE');
  let completed = 0;
  let failed = 0;
  let deadLettered = 0;
  for (const event of events) {
    try {
      const article = await prisma.knowledgeArticle.findUnique({ where: { id: event.articleId } });
      await input.cache.invalidate({
        articleId: event.articleId,
        ownerScope: event.ownerScope,
        companyId: event.companyId,
      });
      if (!article || article.version !== event.sourceVersion) {
        await completeKnowledgeIndexEvent(event, input.now);
        completed += 1;
        continue;
      }
      const document = knowledgeDocumentFromArticle(article);
      const indexable =
        article.status === 'PUBLISHED' &&
        article.visibility !== 'PRIVATE' &&
        article.quarantinedAt === null;
      if (!indexable) {
        await Promise.all([
          search.remove(article.id, article.version),
          vectors.remove(article.id, article.version),
        ]);
      } else {
        const tenant = {
          companyId: article.ownerScope === 'ORGANIZATION' ? article.companyId! : 'platform',
          userId: 'knowledge-index-worker',
        };
        const embedding = await rag.gateway.createDocumentEmbeddings({
          tenant,
          texts: [document.searchText],
          purpose: 'document',
          correlationId: event.id,
          usageIdempotencyKey: event.idempotencyKey,
        });
        await search.upsert(document);
        await vectors.upsert({
          document,
          vector: embedding.vectors[0]!,
          model: embedding.model,
          embeddingVersion: rag.configuration.embedding.version,
        });
        await input.cache.put(document);
      }
      await completeKnowledgeIndexEvent(event, input.now);
      completed += 1;
    } catch {
      await failKnowledgeIndexEvent(event, 'KNOWLEDGE_INDEX_OPERATION_FAILED', input.now);
      if (event.attempts >= event.maxAttempts) deadLettered += 1;
      else failed += 1;
    }
  }
  return { claimed: events.length, completed, failed, deadLettered };
}

export async function runKnowledgeIndexWorker(input: {
  once?: boolean;
  signal?: AbortSignal;
  environment?: NodeJS.ProcessEnv;
}) {
  const environment = input.environment ?? process.env;
  const staging = loadStagingConfiguration(environment);
  const workerId = environment.KNOWLEDGE_INDEX_WORKER_ID?.trim() ?? '';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,99}$/u.test(workerId)) {
    throw new Error('KNOWLEDGE_INDEX_WORKER_ID_INVALID');
  }
  const redis: RedisCommandClient = await createRedisCommandClient(staging.redis.url.toString(), {
    connectTimeoutMs: staging.redis.connectTimeoutMs,
  });
  const cache = new RedisKnowledgeCacheAdapter(
    redis,
    staging.redis.namespace,
    staging.redis.defaultTtlSeconds,
  );
  const prisma = await getPrisma();
  if (!prisma) throw new Error('KNOWLEDGE_INDEX_DATABASE_UNAVAILABLE');
  const startedAt = new Date();
  const totals = { claimed: 0, completed: 0, failed: 0, deadLettered: 0 };
  try {
    do {
      if (input.signal?.aborted) break;
      let batch = { claimed: 0, completed: 0, failed: 0, deadLettered: 0 };
      let lastErrorCode: string | null = null;
      try {
        batch = await processKnowledgeIndexBatch({
          batchSize: Math.min(staging.notifications.batchSize, 100),
          leaseMs: staging.notifications.leaseMs,
          cache,
        });
        for (const key of Object.keys(totals) as Array<keyof typeof totals>)
          totals[key] += batch[key];
      } catch {
        lastErrorCode = 'KNOWLEDGE_INDEX_BATCH_FAILED';
      }
      await prisma.knowledgeIndexWorkerHeartbeat.upsert({
        where: { workerId },
        create: {
          workerId,
          workerVersion: staging.versions.application,
          deploymentGeneration: staging.versions.deploymentGeneration,
          status: lastErrorCode ? 'degraded' : 'ready',
          lastBatchSize: batch.claimed,
          lastErrorCode,
          startedAt,
        },
        update: {
          workerVersion: staging.versions.application,
          deploymentGeneration: staging.versions.deploymentGeneration,
          status: lastErrorCode ? 'degraded' : 'ready',
          lastBatchSize: batch.claimed,
          lastErrorCode,
          heartbeatAt: new Date(),
        },
      });
      console.info(
        JSON.stringify({
          event: 'knowledge-index-worker-batch',
          workerId,
          ...batch,
          error: lastErrorCode,
        }),
      );
      if (input.once) break;
      await waitForNextPoll(1_000, input.signal);
    } while (!input.signal?.aborted);
  } finally {
    await redis.close?.();
  }
  return totals;
}

function waitForNextPoll(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timeout = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}
