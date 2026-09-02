import { randomUUID } from 'node:crypto';

import { getPrisma } from '@avantime/database';

import { loadDocumentConfiguration } from '../lib/document-configuration';
import type { DocumentTenantContext } from '../lib/document-model';
import {
  cleanupDeletedDocuments,
  createDocumentServices,
  deleteDocument,
  enqueueUploadedDocument,
} from '../lib/document-services';
import { calculateDocumentChecksum } from '../lib/document-storage';
import { createJiraWebhookSignature, ingestJiraWebhook } from '../lib/jira-webhook';
import {
  PostgreSQLKnowledgeSearchAdapter,
  PostgreSQLKnowledgeVectorAdapter,
} from '../lib/knowledge-indexing';
import { processKnowledgeIndexBatch } from '../lib/knowledge-index-worker';
import { enqueueNotification } from '../lib/notification-outbox';
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

function createSyntheticPdf(text: string) {
  const escaped = text.replace(/([\\()])/gu, '\\$1');
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

async function waitFor<T>(load: () => Promise<T>, ready: (value: NoInfer<T>) => boolean) {
  const deadline = Date.now() + 60_000;
  let value = await load();
  while (!ready(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    value = await load();
  }
  return value;
}

async function main() {
  const configuration = loadStagingConfiguration();
  if (configuration.mode !== 'local') {
    throw new Error('LOCAL_STAGING_SMOKE_MODE_REQUIRED');
  }
  if (
    configuration.notifications.provider !== 'test' ||
    !configuration.jira.enabled ||
    configuration.jira.mode !== 'test' ||
    configuration.jiraWebhook.mode !== 'test'
  ) {
    throw new Error('LOCAL_STAGING_SMOKE_TEST_PROVIDERS_REQUIRED');
  }
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
  const documentId = `smoke-document-${randomUUID()}`;
  const documentStoredName = `${documentId}.pdf`;
  const documentTenant: DocumentTenantContext = {
    companyId: process.env.DOCUMENT_WORKER_TENANT_ID ?? 'staging-system',
    userId: 'staging-smoke',
  };
  const documentServices = createDocumentServices(loadDocumentConfiguration(), {
    redisClient: redis,
  });
  try {
    await expectHttp(baseUrl, '/health', 200);
    await expectHttp(baseUrl, '/ready', 200);
    await expectHttp(baseUrl, '/portal/login', 200);
    await expectHttp(baseUrl, '/api/requests', 401);

    const database = await prisma.$queryRaw<Array<{ ready: number }>>`SELECT 1::INTEGER AS "ready"`;
    if (database[0]?.ready !== 1) throw new Error('SMOKE_DATABASE_QUERY_FAILED');
    await probeStagingRedis(redis, configuration.redis.namespace, correlationId);
    await probeStagingObjectStorage(configuration.objectStorage);

    const documentContent = createSyntheticPdf(
      [
        'Avantime staging smoke proves document extraction embedding hybrid retrieval and citation with synthetic evidence.',
        'The production-like local pipeline stores the original in private object storage and processes it asynchronously.',
        'Redis lease queues coordinate separate document and embedding workers before vectors are written to PostgreSQL.',
        'Every statement in this fixture is synthetic and exists only to validate the isolated local release gate.',
      ].join(' '),
    );
    const documentChecksum = calculateDocumentChecksum(documentContent);
    await documentServices.storage.write(
      documentTenant,
      'original',
      documentStoredName,
      documentContent,
      { checksum: documentChecksum, contentType: 'application/pdf' },
    );
    const documentNow = new Date().toISOString();
    await documentServices.metadata.create(documentTenant, {
      id: documentId,
      status: 'UPLOADED',
      originalName: documentStoredName,
      storedName: documentStoredName,
      mimeType: 'application/pdf',
      size: documentContent.length,
      checksum: documentChecksum,
      createdAt: documentNow,
      updatedAt: documentNow,
    });
    await enqueueUploadedDocument(documentTenant, documentId, documentServices);
    const completedDocument = await waitFor(
      () => documentServices.metadata.findById(documentTenant, documentId),
      (document) => document?.status === 'COMPLETED' && document.embeddingStatus === 'COMPLETED',
    );
    if (
      completedDocument?.status !== 'COMPLETED' ||
      completedDocument.embeddingStatus !== 'COMPLETED'
    ) {
      throw new Error(
        `SMOKE_DOCUMENT_PIPELINE_INCOMPLETE:${completedDocument?.status ?? 'MISSING'}:${completedDocument?.embeddingStatus ?? 'MISSING'}`,
      );
    }
    const chunks = await documentServices.processing.readChunks(documentTenant, documentId);
    if (chunks.length === 0) throw new Error('SMOKE_DOCUMENT_CHUNKS_MISSING');
    if (!documentServices.rag) throw new Error('SMOKE_DOCUMENT_RAG_UNAVAILABLE');
    const documentResults = await documentServices.rag.hybrid.retrieve({
      tenant: documentTenant,
      query: 'document extraction embedding hybrid retrieval citation',
      correlationId: `${correlationId}:document-retrieval`,
    });
    if (!documentResults.some((result) => result.documentId === documentId)) {
      throw new Error('SMOKE_DOCUMENT_RETRIEVAL_MISSING');
    }
    const documentAnswer = await documentServices.rag.answers.answer({
      tenant: documentTenant,
      question: 'What does the Avantime staging smoke prove?',
      correlationId: `${correlationId}:document-answer`,
    });
    if (
      documentAnswer.status !== 'answered' ||
      !documentAnswer.citations.some((citation) => citation.documentId === documentId)
    ) {
      throw new Error('SMOKE_DOCUMENT_CITATION_MISSING');
    }

    await enqueueNotification({
      idempotencyKey: notificationKey,
      notificationType: 'STAGING_SMOKE',
      recipientReference: `synthetic:${correlationId}`,
      templateReference: 'staging-smoke-v1',
      correlationId,
      maximumAttempts: 3,
    });
    const loadNotification = () =>
      prisma.notificationOutbox.findUnique({
        where: { idempotencyKey: notificationKey },
      });
    const notification = await waitFor<Awaited<ReturnType<typeof loadNotification>>>(
      loadNotification,
      (outbox) =>
        outbox?.status === 'DELIVERED' ||
        outbox?.status === 'FAILED' ||
        outbox?.status === 'DEAD_LETTER',
    );
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
    const loadJiraCreated = () =>
      prisma.supportRequest.findUnique({
        where: { publicId: jiraRequest.id },
        include: { jiraOperations: true },
      });
    const jiraCreated = await waitFor<Awaited<ReturnType<typeof loadJiraCreated>>>(
      loadJiraCreated,
      (request) =>
        request?.jiraIntegrationStatus === 'CREATED' ||
        request?.jiraIntegrationStatus === 'FAILED' ||
        request?.jiraIntegrationStatus === 'DEAD_LETTER',
    );
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
    const loadJiraSynchronized = () =>
      prisma.supportRequest.findUnique({ where: { id: jiraCreated.id } });
    const jiraSynchronized = await waitFor<Awaited<ReturnType<typeof loadJiraSynchronized>>>(
      loadJiraSynchronized,
      (request) => request?.status === 'IN_PROGRESS',
    );
    if (jiraSynchronized?.status !== 'IN_PROGRESS') {
      throw new Error('SMOKE_JIRA_WEBHOOK_NOT_SYNCHRONIZED');
    }
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
    const loadSynchronized = () =>
      prisma.supportRequest.findUnique({
        where: { id: jiraCreated.id },
        include: { messages: true },
      });
    const synchronized = await waitFor<Awaited<ReturnType<typeof loadSynchronized>>>(
      loadSynchronized,
      (request) =>
        request?.messages.some(
          (message: { deliveryStatus: string }) =>
            message.deliveryStatus === 'SENT' ||
            message.deliveryStatus === 'FAILED' ||
            message.deliveryStatus === 'DEAD_LETTER',
        ) ?? false,
    );
    if (
      synchronized?.status !== 'IN_PROGRESS' ||
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
          'document-upload',
          'document-worker-extraction',
          'embedding-worker-pgvector',
          'document-retrieval-citation',
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
    await deleteDocument(documentTenant, documentId, documentServices).catch(() => undefined);
    await cleanupDeletedDocuments(documentTenant, documentServices).catch(() => undefined);
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
