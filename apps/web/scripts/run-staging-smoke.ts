import { randomUUID } from 'node:crypto';

import { getPrisma } from '@avantime/database';

import { TestJiraProvider } from '../lib/jira';
import { processJiraOperationBatch } from '../lib/jira-outbox';
import { processJiraInboundBatch } from '../lib/jira-inbound';
import { createJiraWebhookSignature, ingestJiraWebhook } from '../lib/jira-webhook';
import {
  PostgreSQLKnowledgeSearchAdapter,
  PostgreSQLKnowledgeVectorAdapter,
} from '../lib/knowledge-indexing';
import { processKnowledgeIndexBatch } from '../lib/knowledge-index-worker';
import { enqueueNotification, processNotificationBatch } from '../lib/notification-outbox';
import { TestNotificationProvider } from '../lib/notification-providers';
import { createRedisCommandClient } from '../lib/redis-lease-queue';
import { addRequestMessage, createRequest } from '../lib/requests-store';
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
  const jiraUserId = `smoke-jira-user-${randomUUID()}`;
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
    if (
      !configuration.jira.enabled ||
      configuration.jira.mode !== 'test' ||
      configuration.jiraWebhook.mode !== 'test' ||
      !configuration.jiraWebhook.secret ||
      !configuration.jiraWebhook.allowedOrigin
    ) {
      throw new Error('SMOKE_JIRA_TEST_MODE_REQUIRED');
    }
    await prisma.user.create({
      data: {
        id: jiraUserId,
        email: `${jiraUserId}@synthetic.test`,
        emailNormalized: `${jiraUserId}@synthetic.test`,
        name: 'Synthetic Jira smoke user',
        companyId,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        id: `smoke-jira-membership-${randomUUID()}`,
        userId: jiraUserId,
        companyId,
        organizationRole: 'MEMBER',
      },
    });
    await prisma.jiraOrganizationMapping.create({
      data: {
        companyId,
        projectKey: configuration.jira.defaultProjectKey!,
        issueType: configuration.jira.defaultIssueType,
        enabled: true,
      },
    });
    const jiraRequest = await createRequest(
      {
        title: 'Synthetic staging Jira smoke request',
        description: 'Synthetic content for the isolated Jira test adapter only.',
        category: 'Интеграция',
        priority: 'NORMAL',
      },
      {
        userId: jiraUserId,
        name: 'Synthetic Jira smoke user',
        company: 'TASK-016 staging smoke',
        companyId,
        email: `${jiraUserId}@synthetic.test`,
        role: 'CLIENT',
        organizationRole: 'MEMBER',
        membershipStatus: 'ACTIVE',
        expiresAt: Date.now() + 60_000,
      },
      {
        correlationId: `${correlationId}:jira`,
        idempotencyKey: `request:${correlationId}:jira`,
      },
    );
    await processJiraOperationBatch({
      provider: new TestJiraProvider(configuration.jira),
      batchSize: 1,
      leaseMs: configuration.jira.leaseMs,
      correlationId: `${correlationId}:jira`,
    });
    const jiraCreated = await prisma.supportRequest.findUnique({
      where: { publicId: jiraRequest.id },
      include: { jiraOperations: true },
    });
    if (
      jiraCreated?.jiraIntegrationStatus !== 'CREATED' ||
      !jiraCreated.jiraIssueId ||
      !jiraCreated.jiraKey
    ) {
      const operation = jiraCreated?.jiraOperations[0];
      throw new Error(
        `SMOKE_JIRA_ISSUE_NOT_CREATED:${JSON.stringify({
          requestStatus: jiraCreated?.jiraIntegrationStatus ?? 'MISSING',
          operationStatus: operation?.status ?? 'MISSING',
          attemptCount: operation?.attempts ?? 0,
          nextAttemptAt: operation?.nextAttemptAt ?? null,
          leaseUntil: operation?.leaseUntil ?? null,
          providerIssueKey: operation?.providerIssueKey ?? null,
          lastErrorCode: operation?.lastFailureCode ?? null,
        })}`,
      );
    }
    const timestamp = Date.now();
    const webhookBody = JSON.stringify({
      timestamp,
      webhookEvent: 'jira:issue_updated',
      issue: {
        id: jiraCreated.jiraIssueId,
        key: jiraCreated.jiraKey,
        self: `${configuration.jiraWebhook.allowedOrigin}/rest/api/3/issue/${jiraCreated.jiraIssueId}`,
        fields: {
          status: { id: 'smoke-progress', name: 'In Progress' },
          updated: new Date(timestamp).toISOString(),
        },
      },
      changelog: { id: `smoke-${timestamp}` },
    });
    await ingestJiraWebhook({
      rawBody: webhookBody,
      signature: createJiraWebhookSignature(configuration.jiraWebhook.secret, webhookBody),
    });
    await processJiraInboundBatch({
      batchSize: configuration.jiraWebhook.batchSize,
      leaseMs: configuration.jiraWebhook.leaseMs,
    });
    await addRequestMessage(
      jiraRequest.id,
      'Synthetic customer Jira comment.',
      {
        userId: jiraUserId,
        name: 'Synthetic Jira smoke user',
        company: 'TASK-017 staging smoke',
        companyId,
        email: `${jiraUserId}@synthetic.test`,
        role: 'CLIENT',
        organizationRole: 'MEMBER',
        membershipStatus: 'ACTIVE',
        expiresAt: Date.now() + 60_000,
      },
      {
        correlationId: `${correlationId}:jira-comment`,
        idempotencyKey: `jira:comment:${correlationId}`,
      },
    );
    await processJiraOperationBatch({
      provider: new TestJiraProvider(configuration.jira),
      batchSize: 1,
      leaseMs: configuration.jira.leaseMs,
      correlationId: `${correlationId}:jira-comment`,
    });
    const synchronized = await prisma.supportRequest.findUniqueOrThrow({
      where: { id: jiraCreated.id },
      include: { messages: true },
    });
    if (
      synchronized.status !== 'IN_PROGRESS' ||
      !synchronized.messages.some(
        (message: { deliveryStatus: string }) => message.deliveryStatus === 'SENT',
      )
    ) {
      throw new Error('SMOKE_JIRA_SYNC_NOT_COMPLETED');
    }
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
          'jira-test-adapter',
          'jira-webhook-status-sync',
          'jira-customer-comment',
          'knowledge-versioning',
          'tenant-isolation',
          'archive-removal',
        ],
      }),
    );
  } finally {
    const jiraRequests = await prisma.supportRequest
      .findMany({ where: { companyId }, select: { id: true } })
      .catch(() => []);
    await prisma.notificationOutbox
      .deleteMany({ where: { correlationId: { startsWith: correlationId } } })
      .catch(() => undefined);
    await prisma.productionAuditEvent
      .deleteMany({ where: { correlationId: { startsWith: correlationId } } })
      .catch(() => undefined);
    await prisma.portalNotification.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.jiraInboundEvent.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.jiraOperation
      .deleteMany({
        where: { requestId: { in: jiraRequests.map((request: { id: string }) => request.id) } },
      })
      .catch(() => undefined);
    await prisma.supportRequest.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.jiraOrganizationMapping
      .deleteMany({ where: { companyId } })
      .catch(() => undefined);
    await prisma.organizationMembership.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: jiraUserId } }).catch(() => undefined);
    await prisma.knowledgeIndexEvent.deleteMany({ where: { articleId } }).catch(() => undefined);
    await prisma.knowledgeSearchIndex.deleteMany({ where: { articleId } }).catch(() => undefined);
    await prisma.knowledgeVectorIndex.deleteMany({ where: { articleId } }).catch(() => undefined);
    await prisma.knowledgeArticle.deleteMany({ where: { id: articleId } }).catch(() => undefined);
    await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => undefined);
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
