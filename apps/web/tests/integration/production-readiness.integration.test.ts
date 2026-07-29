import assert from 'node:assert/strict';
import test from 'node:test';

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { PostgreSQLAiCostController, RedisAiRateLimiter } from '../../lib/ai-control';
import { PostgreSQLProductionAuditTrail } from '../../lib/production-audit';
import {
  createRedisCommandClient,
  RedisDocumentProcessingQueue,
  RedisEmbeddingJobQueue,
} from '../../lib/redis-lease-queue';
import type { VectorDatabaseClient } from '../../lib/vector-repository';
import { integrationDatabase, integrationTenant } from './integration-test-environment';
import { backupObjectStorage } from '../../lib/object-storage-backup';

test('Redis queues, fencing, distributed rate limits, cost ledger and audit work end to end', async () => {
  const database = await integrationDatabase();
  const redisUrl = process.env.REDIS_URL || 'redis://:avantime_redis_test_only@127.0.0.1:56379/0';
  const firstClient = await createRedisCommandClient(redisUrl);
  const secondClient = await createRedisCommandClient(redisUrl);
  const suffix = crypto.randomUUID();
  const tenant = integrationTenant(`production-${suffix}`);
  const documentQueue = new RedisDocumentProcessingQueue(firstClient, `document-${suffix}`);
  const embeddingQueue = new RedisEmbeddingJobQueue(firstClient, `embedding-${suffix}`);
  const documentIds = [`document-${suffix}-1`, `document-${suffix}-2`];
  const sourceObjectKey = `task005-backup-${suffix}`;
  const destinationObjectKey = `integration/${new Date().toISOString().slice(0, 10)}/${sourceObjectKey}`;
  const objectClient = new S3Client({
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
    region: process.env.OBJECT_STORAGE_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY ?? '',
      secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? '',
    },
  });

  try {
    await objectClient.send(
      new PutObjectCommand({
        Bucket: process.env.OBJECT_STORAGE_BUCKET,
        Key: sourceObjectKey,
        Body: Buffer.from('task-005-backup-verification'),
      }),
    );
    const objectBackup = await backupObjectStorage(
      {
        ...process.env,
        BACKUP_ENVIRONMENT: 'integration',
        BACKUP_CONFIRMATION: 'BACKUP:integration',
        BACKUP_OBJECT_STORAGE_BUCKET: 'avantime-backups-integration',
        BACKUP_OBJECT_STORAGE_SSE: 'none',
      },
      { execute: true, client: objectClient },
    );
    assert.ok(objectBackup.objectCount >= 1);
    assert.ok(objectBackup.manifestChecksum);
    assert.equal(objectBackup.encryption, 'integration-only-disabled');

    const firstEnqueue = await documentQueue.enqueue(tenant, documentIds[0]);
    assert.equal(firstEnqueue.enqueued, true);
    assert.equal((await documentQueue.enqueue(tenant, documentIds[0])).enqueued, false);
    await documentQueue.enqueue(tenant, documentIds[1]);

    const [first, second] = await Promise.all([
      documentQueue.claim(tenant, 'worker-1', { leaseDurationMs: 80 }),
      documentQueue.claim(tenant, 'worker-2', { leaseDurationMs: 5_000 }),
    ]);
    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first.documentId, second.documentId);
    await documentQueue.acknowledge(tenant, second.id, 'worker-2', second.fencingToken);

    await new Promise((resolve) => setTimeout(resolve, 100));
    const recovered = await documentQueue.claim(tenant, 'worker-3', {
      leaseDurationMs: 5_000,
    });
    assert.equal(recovered?.id, first.id);
    assert.ok(recovered!.fencingToken! > first.fencingToken!);
    await assert.rejects(() =>
      documentQueue.acknowledge(tenant, first.id, 'worker-1', first.fencingToken),
    );
    const renewed = await documentQueue.renew(
      tenant,
      recovered!.id,
      'worker-3',
      recovered!.fencingToken!,
      5_000,
    );
    assert.ok(new Date(renewed.leaseExpiresAt!).getTime() > Date.now());
    await documentQueue.acknowledge(tenant, recovered!.id, 'worker-3', recovered!.fencingToken);

    const embedding = await embeddingQueue.enqueue(tenant, `embedding-${suffix}`);
    const embeddingClaim = await embeddingQueue.claim(tenant, 'embedding-worker', {
      leaseDurationMs: 5_000,
    });
    assert.equal(embeddingClaim?.id, embedding.job.id);
    await embeddingQueue.acknowledge(
      tenant,
      embeddingClaim!.id,
      'embedding-worker',
      embeddingClaim!.fencingToken,
    );

    const firstLimiter = new RedisAiRateLimiter(firstClient);
    const secondLimiter = new RedisAiRateLimiter(secondClient);
    const limitRequest = {
      tenant,
      provider: 'fake',
      requestType: 'rag_answer' as const,
      minuteLimit: 2,
      dailyLimit: 10,
      burstLimit: 2,
    };
    const rateLimitResults = await Promise.all([
      firstLimiter.consume(limitRequest),
      secondLimiter.consume(limitRequest),
      firstLimiter.consume(limitRequest),
    ]);
    assert.equal(rateLimitResults.filter(Boolean).length, 2);
    assert.equal(rateLimitResults.filter((result) => !result).length, 1);

    await database.$executeRawUnsafe(
      `INSERT INTO "AiBudgetPolicy" (
         "companyId", "dailyLimitEur", "monthlyLimitEur", "warningThreshold",
         "hardStopThreshold", "createdAt", "updatedAt"
       ) VALUES ($1, 1, 10, 0.8, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("companyId") DO UPDATE SET "dailyLimitEur" = 1, "monthlyLimitEur" = 10`,
      tenant.companyId,
    );
    const loadDatabase = async () => database as unknown as VectorDatabaseClient;
    const firstCost = new PostgreSQLAiCostController(loadDatabase, 1, 10);
    const secondCost = new PostgreSQLAiCostController(loadDatabase, 1, 10);
    const reservationRequest = {
      tenant,
      provider: 'fake',
      model: 'fake-v1',
      requestType: 'rag_answer' as const,
      correlationId: `correlation-${suffix}`,
      idempotencyKey: `usage-${suffix}-1`,
      estimatedCostEur: 0.75,
    };
    const reservations = await Promise.all([
      firstCost.reserve(reservationRequest),
      secondCost.reserve({
        ...reservationRequest,
        correlationId: `correlation-${suffix}-2`,
        idempotencyKey: `usage-${suffix}-2`,
      }),
    ]);
    assert.equal(reservations.filter(Boolean).length, 1);
    const accepted = reservations.find(Boolean)!;
    await firstCost.reconcile({
      reservation: accepted,
      inputTokens: 100,
      outputTokens: 20,
      embeddingUnits: 0,
      estimatedCostEur: 0.7,
      status: 'SUCCEEDED',
    });
    await firstCost.reconcile({
      reservation: accepted,
      inputTokens: 100,
      outputTokens: 20,
      embeddingUnits: 0,
      estimatedCostEur: 0.7,
      status: 'SUCCEEDED',
    });
    assert.equal(await secondCost.reserve(reservationRequest), null);
    const ledger = await database.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS "count" FROM "AiUsageLedger" WHERE "companyId" = $1`,
      tenant.companyId,
    );
    assert.equal(Number(ledger[0].count), 1);

    const audit = new PostgreSQLProductionAuditTrail(loadDatabase);
    await audit.append({
      companyId: tenant.companyId,
      actorId: tenant.userId,
      action: 'document.reindex',
      targetType: 'document',
      targetId: documentIds[0],
      result: 'SUCCEEDED',
      correlationId: `audit-${suffix}`,
      safeMetadata: { dryRun: false },
    });
    assert.equal((await audit.list(tenant.companyId)).length, 1);
  } finally {
    for (const documentId of documentIds) {
      await documentQueue.removeForDocument(tenant, documentId);
    }
    await embeddingQueue.removeForDocument(tenant, `embedding-${suffix}`);
    await Promise.all([
      objectClient.send(
        new DeleteObjectCommand({
          Bucket: process.env.OBJECT_STORAGE_BUCKET,
          Key: sourceObjectKey,
        }),
      ),
      objectClient.send(
        new DeleteObjectCommand({
          Bucket: 'avantime-backups-integration',
          Key: destinationObjectKey,
        }),
      ),
    ]);
    objectClient.destroy();
    for (const table of [
      'ProductionAuditEvent',
      'AiUsageLedger',
      'AiBudgetReservation',
      'AiBudgetPolicy',
    ]) {
      await database.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE "companyId" = $1`,
        tenant.companyId,
      );
    }
    await Promise.all([firstClient.close?.(), secondClient.close?.()]);
  }
});
