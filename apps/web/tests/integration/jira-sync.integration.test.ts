import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import { TestJiraProvider, type JiraProviderAdapter } from '../../lib/jira';
import { loadJiraConfiguration } from '../../lib/jira-configuration';
import { processJiraInboundBatch } from '../../lib/jira-inbound';
import { processJiraOperationBatch } from '../../lib/jira-outbox';
import {
  createJiraWebhookSignature,
  ingestJiraWebhook,
  JiraWebhookError,
} from '../../lib/jira-webhook';
import { addRequestMessage, createRequest, getRequest } from '../../lib/requests-store';
import type { AppSession } from '../../lib/session';
import { integrationDatabase } from './integration-test-environment';

function jiraEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'test',
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
  };
}

function webhookEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    JIRA_WEBHOOK_MODE: 'test',
    JIRA_WEBHOOK_SECRET: 'integration-webhook-secret-at-least-32-characters',
    JIRA_WEBHOOK_ALLOWED_ORIGIN: 'https://jira.test.invalid',
    JIRA_WEBHOOK_REPLAY_WINDOW_MS: '300000',
    JIRA_WEBHOOK_MAX_PAYLOAD_BYTES: '262144',
    JIRA_WEBHOOK_ENABLED_EVENTS:
      'jira:issue_updated,jira:issue_deleted,comment_created,comment_updated',
    JIRA_INBOUND_MAX_ATTEMPTS: '3',
    JIRA_INBOUND_BATCH_SIZE: '10',
    JIRA_INBOUND_LEASE_MS: '5000',
    JIRA_INBOUND_POLL_INTERVAL_MS: '250',
    JIRA_INBOUND_RETENTION_DAYS: '30',
  };
}

function session(companyId: string, userId: string, runId: string): AppSession {
  return {
    userId,
    name: `Jira sync ${runId}`,
    company: `Jira sync ${runId}`,
    companyId,
    email: `${runId}@jira-sync.test`,
    role: 'CLIENT',
    organizationRole: 'MEMBER',
    membershipStatus: 'ACTIVE',
    membershipVersion: 1,
    expiresAt: Date.now() + 60_000,
  };
}

function webhookPayload(input: {
  issueId: string;
  issueKey: string;
  timestamp?: number;
  updatedAt?: Date;
  event?: 'jira:issue_updated' | 'comment_created' | 'comment_updated';
  statusName?: string;
  commentId?: string;
  commentBody?: unknown;
  public?: boolean;
  origin?: string;
}) {
  const timestamp = input.timestamp ?? Date.now();
  const event = input.event ?? 'jira:issue_updated';
  const origin = input.origin ?? 'https://jira.test.invalid';
  return JSON.stringify({
    timestamp,
    webhookEvent: event,
    issue: {
      id: input.issueId,
      key: input.issueKey,
      self: `${origin}/rest/api/3/issue/${input.issueId}`,
      fields: {
        updated: (input.updatedAt ?? new Date(timestamp)).toISOString(),
        status: {
          id: `status-${input.statusName ?? 'progress'}`,
          name: input.statusName ?? 'In Progress',
        },
      },
    },
    ...(event === 'jira:issue_updated'
      ? { changelog: { id: `change-${timestamp}-${input.statusName ?? 'progress'}` } }
      : {
          comment: {
            id: input.commentId,
            body: input.commentBody ?? 'Safe Jira public comment',
            jsdPublic: input.public === true,
            author: { displayName: 'Jira Specialist', accountType: 'atlassian' },
            created: (input.updatedAt ?? new Date(timestamp)).toISOString(),
            updated: (input.updatedAt ?? new Date(timestamp)).toISOString(),
          },
        }),
  });
}

async function ingest(rawBody: string) {
  return ingestJiraWebhook({
    rawBody,
    signature: createJiraWebhookSignature(webhookEnvironment().JIRA_WEBHOOK_SECRET!, rawBody),
    environment: webhookEnvironment(),
  });
}

test('Jira sync is durable, tenant-safe, stale-fenced and comment delivery is idempotent', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const runId = crypto.randomUUID();
  const companyId = `jira-sync-company-${runId}`;
  const userId = `jira-sync-user-${runId}`;
  const correlationPrefix = `jira-sync-${runId}`;
  const ownSession = session(companyId, userId, runId);
  const configuration = loadJiraConfiguration(jiraEnvironment());
  try {
    await prisma.company.create({ data: { id: companyId, name: `Jira sync ${runId}` } });
    await prisma.user.create({
      data: {
        id: userId,
        email: `${runId}@jira-sync.test`,
        emailNormalized: `${runId}@jira-sync.test`,
        name: `Jira sync ${runId}`,
        companyId,
      },
    });
    await prisma.organizationMembership.create({
      data: { id: `membership-${runId}`, companyId, userId, organizationRole: 'MEMBER' },
    });
    await prisma.jiraOrganizationMapping.create({
      data: {
        companyId,
        projectKey: 'TEST',
        issueType: 'Task',
        enabled: true,
        statusMapping: { QA: 'WAITING_CUSTOMER' },
      },
    });
    const request = await createRequest(
      {
        title: `Jira sync ${runId}`,
        description: 'Synthetic request for Jira status and comment synchronization.',
        category: 'Интеграция',
        priority: 'HIGH',
      },
      ownSession,
      {
        correlationId: `${correlationPrefix}:create`,
        idempotencyKey: `request:${runId}`,
        environment: jiraEnvironment(),
      },
    );
    const createProvider = new TestJiraProvider(configuration);
    assert.deepEqual(
      await processJiraOperationBatch({
        provider: createProvider,
        batchSize: 1,
        leaseMs: 5_000,
        companyId,
        correlationId: `${correlationPrefix}:create`,
      }),
      { claimed: 1, completed: 1, failed: 0, deadLettered: 0 },
    );
    const linked = await prisma.supportRequest.findUniqueOrThrow({
      where: { publicId: request.id },
    });
    assert.ok(linked.jiraIssueId);
    assert.ok(linked.jiraKey);

    const statusRaw = webhookPayload({ issueId: linked.jiraIssueId, issueKey: linked.jiraKey });
    const accepted = await ingest(statusRaw);
    assert.equal(accepted.outcome, 'accepted');
    const duplicate = await ingest(statusRaw);
    assert.equal(duplicate.outcome, 'duplicate');
    const publicRaw = webhookPayload({
      issueId: linked.jiraIssueId,
      issueKey: linked.jiraKey,
      timestamp: Date.now() + 1,
      event: 'comment_created',
      commentId: `public-${runId}`,
      commentBody: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Public Jira update' }] }],
      },
      public: true,
    });
    await ingest(publicRaw);
    const concurrent = await Promise.all([
      processJiraInboundBatch({ batchSize: 1, leaseMs: 5_000, companyId }),
      processJiraInboundBatch({ batchSize: 1, leaseMs: 5_000, companyId }),
    ]);
    assert.equal(
      concurrent.reduce((sum, result) => sum + result.claimed, 0),
      2,
    );
    assert.equal(
      concurrent.reduce((sum, result) => sum + result.completed, 0),
      2,
    );
    const synchronized = await prisma.supportRequest.findUniqueOrThrow({
      where: { id: linked.id },
    });
    assert.equal(synchronized.status, 'IN_PROGRESS');
    assert.equal(synchronized.jiraStatusName, 'In Progress');
    assert.equal(synchronized.jiraSyncVersion, 1);
    assert.equal(
      await prisma.requestMessage.count({ where: { jiraCommentId: `public-${runId}` } }),
      1,
    );
    assert.equal(
      await prisma.notificationOutbox.count({
        where: {
          correlationId: { startsWith: 'jira-hook-' },
          notificationType: { in: ['JIRA_STATUS_UPDATED', 'JIRA_PUBLIC_COMMENT'] },
          recipientUserId: userId,
        },
      }),
      2,
    );
    const commentUpdateRaw = webhookPayload({
      issueId: linked.jiraIssueId,
      issueKey: linked.jiraKey,
      timestamp: Date.now() + 2,
      updatedAt: new Date(Date.now() + 10_000),
      event: 'comment_updated',
      commentId: `public-${runId}`,
      commentBody: 'Updated public Jira comment',
      public: true,
    });
    await ingest(commentUpdateRaw);
    assert.equal(
      (await processJiraInboundBatch({ batchSize: 1, leaseMs: 5_000, companyId })).completed,
      1,
    );
    assert.equal(
      (
        await prisma.requestMessage.findUniqueOrThrow({
          where: { jiraCommentId: `public-${runId}` },
        })
      ).body,
      'Updated public Jira comment',
    );
    assert.equal(
      await prisma.requestMessage.count({ where: { jiraCommentId: `public-${runId}` } }),
      1,
    );

    const staleRaw = webhookPayload({
      issueId: linked.jiraIssueId,
      issueKey: linked.jiraKey,
      timestamp: Date.now() + 3,
      updatedAt: new Date(synchronized.jiraUpdatedAt!.getTime() - 1_000),
      statusName: 'Open',
    });
    await ingest(staleRaw);
    assert.equal(
      (await processJiraInboundBatch({ batchSize: 1, leaseMs: 5_000, companyId })).ignored,
      1,
    );
    assert.equal(
      (await prisma.supportRequest.findUniqueOrThrow({ where: { id: linked.id } })).status,
      'IN_PROGRESS',
    );

    const privateText = `private-${runId}-must-not-persist`;
    const privateRaw = webhookPayload({
      issueId: linked.jiraIssueId,
      issueKey: linked.jiraKey,
      timestamp: Date.now() + 4,
      event: 'comment_created',
      commentId: `private-${runId}`,
      commentBody: privateText,
      public: false,
    });
    const privateEvent = await ingest(privateRaw);
    assert.equal(privateEvent.outcome, 'accepted');
    assert.equal(
      JSON.stringify(
        await prisma.jiraInboundEvent.findUniqueOrThrow({ where: { id: privateEvent.eventId } }),
      ).includes(privateText),
      false,
    );
    assert.equal(
      (await processJiraInboundBatch({ batchSize: 1, leaseMs: 5_000, companyId })).ignored,
      1,
    );
    assert.equal(
      await prisma.requestMessage.count({ where: { jiraCommentId: `private-${runId}` } }),
      0,
    );

    const unknownRaw = webhookPayload({ issueId: `unknown-${runId}`, issueKey: 'TEST-9999999' });
    assert.deepEqual(await ingest(unknownRaw), { outcome: 'ignored', reason: 'unknown_issue' });
    const wrongTenantRaw = webhookPayload({
      issueId: linked.jiraIssueId,
      issueKey: linked.jiraKey,
      origin: 'https://foreign.test.invalid',
    });
    await assert.rejects(
      () => ingest(wrongTenantRaw),
      (error: unknown) =>
        error instanceof JiraWebhookError && error.code === 'JIRA_WEBHOOK_TENANT_DENIED',
    );

    const commentKey = `jira:comment:${runId}:success`;
    await addRequestMessage('' + request.id, 'Customer safe comment', ownSession, {
      idempotencyKey: commentKey,
      correlationId: `${correlationPrefix}:comment-success`,
      environment: jiraEnvironment(),
    });
    await addRequestMessage(request.id, 'Customer safe comment replay', ownSession, {
      idempotencyKey: commentKey,
      correlationId: `${correlationPrefix}:comment-replay`,
      environment: jiraEnvironment(),
    });
    assert.equal(await prisma.requestMessage.count({ where: { idempotencyKey: commentKey } }), 1);
    const deliveryCalls = new Map<string, number>();
    const outboundProvider: JiraProviderAdapter = {
      kind: 'test',
      checkReadiness: () => createProvider.checkReadiness(),
      createIssue: (payload, attempt) => createProvider.createIssue(payload, attempt),
      addComment: async (payload, attempt) => {
        deliveryCalls.set(payload.marker, (deliveryCalls.get(payload.marker) ?? 0) + 1);
        return createProvider.addComment(payload, attempt);
      },
    };
    const outboundWorkers = await Promise.all([
      processJiraOperationBatch({
        provider: outboundProvider,
        batchSize: 1,
        leaseMs: 5_000,
        companyId,
      }),
      processJiraOperationBatch({
        provider: outboundProvider,
        batchSize: 1,
        leaseMs: 5_000,
        companyId,
      }),
    ]);
    assert.equal(
      outboundWorkers.reduce((sum, result) => sum + result.completed, 0),
      1,
    );
    assert.deepEqual([...deliveryCalls.values()], [1]);
    const sentComment = await prisma.requestMessage.findUniqueOrThrow({
      where: { idempotencyKey: commentKey },
    });
    assert.equal(sentComment.deliveryStatus, 'SENT');
    assert.ok(sentComment.jiraCommentId);
    const outboundEchoRaw = webhookPayload({
      issueId: linked.jiraIssueId,
      issueKey: linked.jiraKey,
      timestamp: Date.now() + 5,
      updatedAt: new Date(Date.now() + 20_000),
      event: 'comment_updated',
      commentId: sentComment.jiraCommentId,
      commentBody: 'Provider echo must not replace the customer comment',
      public: true,
    });
    await ingest(outboundEchoRaw);
    assert.equal(
      (await processJiraInboundBatch({ batchSize: 1, leaseMs: 5_000, companyId })).ignored,
      1,
    );
    const echoedComment = await prisma.requestMessage.findUniqueOrThrow({
      where: { idempotencyKey: commentKey },
    });
    assert.equal(echoedComment.body, 'Customer safe comment');
    assert.equal(echoedComment.authorType, 'CUSTOMER');
    assert.equal(
      await prisma.requestMessage.count({ where: { jiraCommentId: sentComment.jiraCommentId } }),
      1,
    );

    const retryKey = `jira:comment:${runId}:retry`;
    await addRequestMessage(request.id, 'Retry comment', ownSession, {
      idempotencyKey: retryKey,
      correlationId: `${correlationPrefix}:retry`,
      environment: jiraEnvironment(),
    });
    let retryOperation = await prisma.jiraOperation.findFirstOrThrow({
      where: { idempotencyKey: `jira:add-comment:${retryKey}` },
    });
    const retryProvider = new TestJiraProvider(configuration, { transientFailures: 1 });
    assert.equal(
      (
        await processJiraOperationBatch({
          provider: retryProvider,
          batchSize: 1,
          leaseMs: 5_000,
          companyId,
          correlationId: `${correlationPrefix}:retry`,
        })
      ).failed,
      1,
    );
    retryOperation = await prisma.jiraOperation.findUniqueOrThrow({
      where: { id: retryOperation.id },
    });
    assert.equal(
      (
        await processJiraOperationBatch({
          provider: retryProvider,
          batchSize: 1,
          leaseMs: 5_000,
          now: new Date(retryOperation.nextAttemptAt.getTime() + 1),
          companyId,
          correlationId: `${correlationPrefix}:retry`,
        })
      ).completed,
      1,
    );

    const deadKey = `jira:comment:${runId}:dead`;
    await addRequestMessage(request.id, 'Permanent failure comment', ownSession, {
      idempotencyKey: deadKey,
      correlationId: `${correlationPrefix}:dead`,
      environment: jiraEnvironment(),
    });
    assert.equal(
      (
        await processJiraOperationBatch({
          provider: new TestJiraProvider(configuration, { permanentFailure: true }),
          batchSize: 1,
          leaseMs: 5_000,
          companyId,
          correlationId: `${correlationPrefix}:dead`,
        })
      ).deadLettered,
      1,
    );
    assert.equal(
      (await prisma.requestMessage.findUniqueOrThrow({ where: { idempotencyKey: deadKey } }))
        .deliveryStatus,
      'DEAD_LETTER',
    );

    const recoveryRaw = webhookPayload({
      issueId: linked.jiraIssueId,
      issueKey: linked.jiraKey,
      timestamp: Date.now() + 6,
      statusName: 'QA',
    });
    const recovery = await ingest(recoveryRaw);
    assert.equal(recovery.outcome, 'accepted');
    await prisma.jiraInboundEvent.update({
      where: { id: recovery.eventId },
      data: {
        status: 'PROCESSING',
        attempts: 1,
        leaseToken: 'expired-lease',
        leaseUntil: new Date(Date.now() - 1_000),
      },
    });
    assert.equal(
      (await processJiraInboundBatch({ batchSize: 1, leaseMs: 5_000, companyId })).completed,
      1,
    );
    assert.equal(
      (await prisma.supportRequest.findUniqueOrThrow({ where: { id: linked.id } })).status,
      'WAITING_CUSTOMER',
    );

    await prisma.jiraInboundEvent.create({
      data: {
        eventFingerprint: createHash('sha256').update(`invalid-${runId}`).digest('hex'),
        eventType: 'jira:issue_updated',
        jiraTenantOrigin: 'https://jira.test.invalid',
        jiraIssueId: linked.jiraIssueId,
        jiraIssueKey: linked.jiraKey,
        requestId: linked.id,
        companyId,
        normalizedPayload: { invalid: true },
        occurredAt: new Date(),
        maxAttempts: 1,
        correlationId: `${correlationPrefix}:inbound-dead`,
      },
    });
    assert.equal(
      (await processJiraInboundBatch({ batchSize: 1, leaseMs: 5_000, companyId })).deadLettered,
      1,
    );
    assert.equal(
      await prisma.jiraInboundEvent.count({ where: { companyId, status: 'DEAD_LETTER' } }),
      1,
    );
    assert.equal(
      (await getRequest(request.id, ownSession))?.messages.some(
        (message) => message.body === 'Updated public Jira comment',
      ),
      true,
    );
  } finally {
    const requestIds = (
      await prisma.supportRequest.findMany({ where: { companyId }, select: { id: true } })
    ).map((item) => item.id);
    await prisma.notificationOutbox.deleteMany({
      where: {
        OR: [{ correlationId: { startsWith: correlationPrefix } }, { recipientUserId: userId }],
      },
    });
    await prisma.productionAuditEvent.deleteMany({
      where: { OR: [{ correlationId: { startsWith: correlationPrefix } }, { companyId }] },
    });
    await prisma.portalNotification.deleteMany({ where: { companyId } });
    await prisma.jiraInboundEvent.deleteMany({ where: { companyId } });
    await prisma.jiraOperation.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.supportRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.jiraOrganizationMapping.deleteMany({ where: { companyId } });
    await prisma.organizationMembership.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  }
});
