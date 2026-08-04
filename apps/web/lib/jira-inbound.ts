import { randomUUID } from 'node:crypto';

import { getPrisma } from '@avantime/database';
import type { Prisma } from '@prisma/client';

import { jiraBackoffMs } from './jira-outbox';
import {
  resolveJiraStatus,
  statusTransitionDecision,
  type NormalizedJiraInboundPayload,
  type PortalRequestStatus,
} from './jira-sync-policy';

const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/u;
const SAFE_FAILURE_CODE = /^[A-Z0-9][A-Z0-9_-]{2,99}$/u;

export type JiraInboundEventRecord = {
  id: string;
  eventFingerprint: string;
  eventType: string;
  jiraTenantOrigin: string;
  jiraIssueId: string;
  jiraIssueKey: string;
  requestId: string;
  companyId: string;
  normalizedPayload: unknown;
  occurredAt: Date;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'IGNORED' | 'FAILED' | 'DEAD_LETTER';
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  leaseToken: string | null;
  leaseUntil: Date | null;
  lastFailureCode: string | null;
  correlationId: string;
};

async function databaseNow(prisma: {
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
}) {
  const rows = (await prisma.$queryRaw`SELECT CURRENT_TIMESTAMP AS "now"`) as Array<{ now: Date }>;
  const now = rows[0]?.now;
  if (!(now instanceof Date) || Number.isNaN(now.getTime()))
    throw new Error('JIRA_INBOUND_DATABASE_TIME_INVALID');
  return now;
}

function safeReference(value: string, code: string) {
  if (!SAFE_REFERENCE.test(value)) throw new Error(code);
  return value;
}

function normalizedPayload(value: unknown): NormalizedJiraInboundPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('JIRA_INBOUND_PAYLOAD_INVALID');
  const payload = value as Record<string, unknown>;
  if (payload.kind === 'ISSUE_DELETED' && typeof payload.jiraUpdatedAt === 'string') {
    return payload as NormalizedJiraInboundPayload;
  }
  if (
    payload.kind === 'STATUS' &&
    typeof payload.statusId === 'string' &&
    typeof payload.statusName === 'string' &&
    typeof payload.jiraUpdatedAt === 'string'
  ) {
    return payload as NormalizedJiraInboundPayload;
  }
  if (
    payload.kind === 'COMMENT' &&
    typeof payload.commentId === 'string' &&
    typeof payload.body === 'string' &&
    typeof payload.authorName === 'string' &&
    typeof payload.public === 'boolean' &&
    typeof payload.automation === 'boolean' &&
    typeof payload.jiraUpdatedAt === 'string'
  ) {
    return payload as NormalizedJiraInboundPayload;
  }
  throw new Error('JIRA_INBOUND_PAYLOAD_INVALID');
}

export async function claimJiraInboundEvents(input: {
  batchSize: number;
  leaseMs: number;
  now?: Date;
  correlationId?: string;
  companyId?: string;
}) {
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 100) {
    throw new Error('JIRA_INBOUND_BATCH_SIZE_INVALID');
  }
  if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1_000 || input.leaseMs > 600_000) {
    throw new Error('JIRA_INBOUND_LEASE_INVALID');
  }
  const correlationId = input.correlationId
    ? safeReference(input.correlationId, 'JIRA_INBOUND_CORRELATION_INVALID')
    : null;
  const companyId = input.companyId
    ? safeReference(input.companyId, 'JIRA_INBOUND_COMPANY_INVALID')
    : null;
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_INBOUND_DATABASE_UNAVAILABLE');
  const now = input.now ?? (await databaseNow(prisma));
  const leaseToken = randomUUID();
  const leaseUntil = new Date(now.getTime() + input.leaseMs);
  return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    await transaction.$executeRaw`
      UPDATE "JiraInboundEvent"
      SET "status" = 'DEAD_LETTER', "lastFailureCode" = 'LEASE_EXHAUSTED',
          "leaseToken" = NULL, "leaseUntil" = NULL, "updatedAt" = ${now}
      WHERE "status" = 'PROCESSING' AND "leaseUntil" <= ${now} AND "attempts" >= "maxAttempts"
    `;
    return (await transaction.$queryRaw`
      WITH candidates AS (
        SELECT "id"
        FROM "JiraInboundEvent"
        WHERE "attempts" < "maxAttempts"
          AND (${correlationId}::TEXT IS NULL OR "correlationId" = ${correlationId})
          AND (${companyId}::TEXT IS NULL OR "companyId" = ${companyId})
          AND (
            ("status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= ${now})
            OR ("status" = 'PROCESSING' AND "leaseUntil" <= ${now})
          )
        ORDER BY "occurredAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.batchSize}
      )
      UPDATE "JiraInboundEvent" AS event
      SET "status" = 'PROCESSING', "attempts" = event."attempts" + 1,
          "leaseToken" = ${leaseToken}, "leaseUntil" = ${leaseUntil},
          "lastFailureCode" = NULL, "updatedAt" = ${now}
      FROM candidates
      WHERE event."id" = candidates."id"
      RETURNING event.*
    `) as JiraInboundEventRecord[];
  });
}

function eventAuditData(
  record: JiraInboundEventRecord,
  action: string,
  result: string,
  metadata: Record<string, unknown>,
) {
  const requestPublicId =
    typeof metadata.requestId === 'string' && SAFE_REFERENCE.test(metadata.requestId)
      ? metadata.requestId
      : null;
  return {
    companyId: record.companyId,
    actorId: null,
    action,
    targetType: 'support_request',
    targetId: requestPublicId,
    result,
    correlationId: record.correlationId,
    safeMetadata: {
      jiraIssueKey: record.jiraIssueKey,
      eventFingerprintPrefix: record.eventFingerprint.slice(0, 12),
      ...metadata,
    },
  };
}

async function finishEvent(
  transaction: Prisma.TransactionClient,
  record: JiraInboundEventRecord,
  status: 'COMPLETED' | 'IGNORED',
  now: Date,
) {
  const updated = await transaction.jiraInboundEvent.updateMany({
    where: { id: record.id, status: 'PROCESSING', leaseToken: record.leaseToken },
    data: {
      status,
      completedAt: now,
      leaseToken: null,
      leaseUntil: null,
      lastFailureCode: null,
    },
  });
  if (updated.count !== 1) throw new Error('JIRA_INBOUND_LEASE_LOST');
}

async function processStatus(
  transaction: Prisma.TransactionClient,
  record: JiraInboundEventRecord,
  payload: Extract<NormalizedJiraInboundPayload, { kind: 'STATUS' }>,
  now: Date,
) {
  const [request, mapping] = await Promise.all([
    transaction.supportRequest.findUnique({ where: { id: record.requestId } }),
    transaction.jiraOrganizationMapping.findUnique({ where: { companyId: record.companyId } }),
  ]);
  if (
    !request ||
    request.companyId !== record.companyId ||
    request.jiraIssueId !== record.jiraIssueId ||
    request.jiraKey !== record.jiraIssueKey
  ) {
    throw new Error('JIRA_INBOUND_TENANT_MAPPING_INVALID');
  }
  const mappedStatus = resolveJiraStatus(payload.statusName, mapping?.statusMapping);
  if (!mappedStatus) {
    await transaction.productionAuditEvent.create({
      data: eventAuditData(record, 'jira.status.ignored_unknown', 'DENIED', {
        requestId: request.publicId,
        jiraStatusId: payload.statusId,
      }) as Prisma.ProductionAuditEventUncheckedCreateInput,
    });
    await finishEvent(transaction, record, 'IGNORED', now);
    return 'ignored' as const;
  }
  const incomingAt = new Date(payload.jiraUpdatedAt);
  if (Number.isNaN(incomingAt.getTime())) throw new Error('JIRA_INBOUND_STATUS_DATE_INVALID');
  const decision = statusTransitionDecision({
    currentStatus: request.status as PortalRequestStatus,
    currentJiraUpdatedAt: request.jiraUpdatedAt,
    incomingStatus: mappedStatus,
    incomingJiraUpdatedAt: incomingAt,
  });
  if (decision === 'STALE' || decision === 'TERMINAL_CONFLICT') {
    await transaction.productionAuditEvent.create({
      data: eventAuditData(record, 'jira.status.ignored_stale', 'DENIED', {
        requestId: request.publicId,
        transition: `${request.status}->${mappedStatus}`,
        reasonCode: decision,
      }) as Prisma.ProductionAuditEventUncheckedCreateInput,
    });
    await finishEvent(transaction, record, 'IGNORED', now);
    return 'ignored' as const;
  }
  const updated = await transaction.supportRequest.updateMany({
    where: {
      id: request.id,
      companyId: record.companyId,
      OR: [{ jiraUpdatedAt: null }, { jiraUpdatedAt: { lt: incomingAt } }],
    },
    data: {
      ...(decision === 'APPLY' ? { status: mappedStatus } : {}),
      jiraStatusId: payload.statusId,
      jiraStatusName: payload.statusName,
      jiraUpdatedAt: incomingAt,
      jiraSyncAt: now,
      jiraSyncVersion: { increment: 1 },
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) {
    await transaction.productionAuditEvent.create({
      data: eventAuditData(record, 'jira.status.ignored_stale', 'DENIED', {
        requestId: request.publicId,
        transition: `${request.status}->${mappedStatus}`,
        reasonCode: 'FENCED_BY_CONCURRENT_UPDATE',
      }) as Prisma.ProductionAuditEventUncheckedCreateInput,
    });
    await finishEvent(transaction, record, 'IGNORED', now);
    return 'ignored' as const;
  }
  await transaction.productionAuditEvent.create({
    data: eventAuditData(record, 'jira.status.updated', 'SUCCEEDED', {
      requestId: request.publicId,
      transition: `${request.status}->${mappedStatus}`,
    }) as Prisma.ProductionAuditEventUncheckedCreateInput,
  });
  if (decision === 'APPLY') {
    await transaction.portalNotification.create({
      data: {
        userId: request.requesterId,
        companyId: request.companyId,
        category: 'REQUEST',
        title: `Статус обращения ${request.publicId} обновлён`,
        href: `/portal/requests/${encodeURIComponent(request.publicId)}`,
      },
    });
    await transaction.notificationOutbox.upsert({
      where: { idempotencyKey: `jira-status:${record.eventFingerprint}` },
      create: {
        idempotencyKey: `jira-status:${record.eventFingerprint}`,
        notificationType: 'JIRA_STATUS_UPDATED',
        recipientReference: `user:${request.requesterId}`,
        recipientUserId: request.requesterId,
        templateReference: 'jira-status-updated',
        correlationId: record.correlationId,
      },
      update: {},
    });
  }
  await finishEvent(transaction, record, 'COMPLETED', now);
  return 'completed' as const;
}

async function processComment(
  transaction: Prisma.TransactionClient,
  record: JiraInboundEventRecord,
  payload: Extract<NormalizedJiraInboundPayload, { kind: 'COMMENT' }>,
  now: Date,
) {
  const request = await transaction.supportRequest.findUnique({ where: { id: record.requestId } });
  if (
    !request ||
    request.companyId !== record.companyId ||
    request.jiraIssueId !== record.jiraIssueId ||
    request.jiraKey !== record.jiraIssueKey
  ) {
    throw new Error('JIRA_INBOUND_TENANT_MAPPING_INVALID');
  }
  if (!payload.public || payload.automation) {
    await transaction.productionAuditEvent.create({
      data: eventAuditData(record, 'jira.comment.ignored_private', 'DENIED', {
        requestId: request.publicId,
        reasonCode: payload.automation ? 'AUTOMATION' : 'PRIVATE',
      }) as Prisma.ProductionAuditEventUncheckedCreateInput,
    });
    await finishEvent(transaction, record, 'IGNORED', now);
    return 'ignored' as const;
  }
  const updatedAt = new Date(payload.jiraUpdatedAt);
  if (Number.isNaN(updatedAt.getTime())) throw new Error('JIRA_INBOUND_COMMENT_DATE_INVALID');
  const existing = await transaction.requestMessage.findUnique({
    where: { jiraCommentId: payload.commentId },
  });
  if (existing) {
    if (existing.requestId !== request.id) throw new Error('JIRA_INBOUND_COMMENT_TENANT_COLLISION');
    if (existing.authorType !== 'JIRA') {
      await finishEvent(transaction, record, 'IGNORED', now);
      return 'ignored' as const;
    }
    if (existing.jiraCommentUpdatedAt && updatedAt <= existing.jiraCommentUpdatedAt) {
      await finishEvent(transaction, record, 'IGNORED', now);
      return 'ignored' as const;
    }
    await transaction.requestMessage.update({
      where: { id: existing.id },
      data: {
        body: payload.body,
        authorDisplayName: payload.authorName,
        jiraCommentUpdatedAt: updatedAt,
      },
    });
  } else {
    await transaction.requestMessage.create({
      data: {
        body: payload.body,
        authorId: null,
        authorType: 'JIRA',
        authorDisplayName: payload.authorName,
        deliveryStatus: 'NOT_REQUIRED',
        requestId: request.id,
        jiraCommentId: payload.commentId,
        jiraCommentUpdatedAt: updatedAt,
        correlationId: record.correlationId,
      },
    });
  }
  await transaction.productionAuditEvent.create({
    data: eventAuditData(record, 'jira.comment.imported', 'SUCCEEDED', {
      requestId: request.publicId,
      safeCommentId: payload.commentId,
    }) as Prisma.ProductionAuditEventUncheckedCreateInput,
  });
  if (!existing) {
    await transaction.portalNotification.create({
      data: {
        userId: request.requesterId,
        companyId: request.companyId,
        category: 'MESSAGE',
        title: `Новый комментарий в обращении ${request.publicId}`,
        href: `/portal/requests/${encodeURIComponent(request.publicId)}`,
      },
    });
    await transaction.notificationOutbox.upsert({
      where: { idempotencyKey: `jira-comment:${payload.commentId}` },
      create: {
        idempotencyKey: `jira-comment:${payload.commentId}`,
        notificationType: 'JIRA_PUBLIC_COMMENT',
        recipientReference: `user:${request.requesterId}`,
        recipientUserId: request.requesterId,
        templateReference: 'jira-public-comment',
        correlationId: record.correlationId,
      },
      update: {},
    });
  }
  await finishEvent(transaction, record, 'COMPLETED', now);
  return 'completed' as const;
}

async function processDeleted(
  transaction: Prisma.TransactionClient,
  record: JiraInboundEventRecord,
  now: Date,
) {
  const request = await transaction.supportRequest.findFirst({
    where: { id: record.requestId, companyId: record.companyId, jiraIssueId: record.jiraIssueId },
  });
  if (!request) throw new Error('JIRA_INBOUND_TENANT_MAPPING_INVALID');
  await transaction.supportRequest.update({
    where: { id: request.id },
    data: {
      jiraIntegrationStatus: 'FAILED',
      jiraStatusName: 'Unavailable in Jira',
      jiraSyncAt: now,
      version: { increment: 1 },
    },
  });
  await transaction.productionAuditEvent.create({
    data: eventAuditData(record, 'jira.issue.deleted', 'SUCCEEDED', {
      requestId: request.publicId,
    }) as Prisma.ProductionAuditEventUncheckedCreateInput,
  });
  await finishEvent(transaction, record, 'COMPLETED', now);
  return 'completed' as const;
}

async function processOne(record: JiraInboundEventRecord, now: Date) {
  const payload = normalizedPayload(record.normalizedPayload);
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_INBOUND_DATABASE_UNAVAILABLE');
  return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    if (payload.kind === 'STATUS') return processStatus(transaction, record, payload, now);
    if (payload.kind === 'COMMENT') return processComment(transaction, record, payload, now);
    return processDeleted(transaction, record, now);
  });
}

async function failEvent(record: JiraInboundEventRecord, error: unknown, now: Date) {
  const code =
    error instanceof Error && SAFE_FAILURE_CODE.test(error.message)
      ? error.message
      : 'JIRA_INBOUND_PROCESSING_FAILED';
  const deadLettered =
    record.attempts >= record.maxAttempts || code.includes('TENANT_') || code.includes('PAYLOAD_');
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_INBOUND_DATABASE_UNAVAILABLE');
  await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const request = await transaction.supportRequest.findFirst({
      where: { id: record.requestId, companyId: record.companyId },
      select: { publicId: true },
    });
    const updated = await transaction.jiraInboundEvent.updateMany({
      where: { id: record.id, status: 'PROCESSING', leaseToken: record.leaseToken },
      data: {
        status: deadLettered ? 'DEAD_LETTER' : 'FAILED',
        nextAttemptAt: deadLettered
          ? now
          : new Date(now.getTime() + jiraBackoffMs(record.attempts)),
        leaseToken: null,
        leaseUntil: null,
        lastFailureCode: code,
      },
    });
    if (updated.count !== 1) throw new Error('JIRA_INBOUND_LEASE_LOST');
    await transaction.productionAuditEvent.create({
      data: eventAuditData(
        record,
        deadLettered ? 'jira.inbound.dead_lettered' : 'jira.inbound.failed',
        'FAILED',
        {
          ...(request ? { requestId: request.publicId } : {}),
          normalizedErrorCode: code,
        },
      ) as Prisma.ProductionAuditEventUncheckedCreateInput,
    });
  });
  return deadLettered;
}

export async function processJiraInboundBatch(input: {
  batchSize: number;
  leaseMs: number;
  now?: Date;
  correlationId?: string;
  companyId?: string;
}) {
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_INBOUND_DATABASE_UNAVAILABLE');
  const now = input.now ?? (await databaseNow(prisma));
  const records = await claimJiraInboundEvents({ ...input, now });
  let completed = 0;
  let ignored = 0;
  let failed = 0;
  let deadLettered = 0;
  for (const record of records) {
    try {
      const outcome = await processOne(record, now);
      if (outcome === 'completed') completed += 1;
      else ignored += 1;
    } catch (error) {
      if (await failEvent(record, error, now)) deadLettered += 1;
      else failed += 1;
    }
  }
  return { claimed: records.length, completed, ignored, failed, deadLettered };
}

export async function retryJiraInboundEvent(id: string, now = new Date()) {
  safeReference(id, 'JIRA_INBOUND_EVENT_ID_INVALID');
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_INBOUND_DATABASE_UNAVAILABLE');
  const updated = await prisma.jiraInboundEvent.updateMany({
    where: { id, status: { in: ['FAILED', 'DEAD_LETTER'] } },
    data: {
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: now,
      leaseToken: null,
      leaseUntil: null,
      lastFailureCode: null,
      completedAt: null,
    },
  });
  if (updated.count !== 1) throw new Error('JIRA_INBOUND_RETRY_NOT_FOUND');
}

export async function moveJiraInboundEventToDeadLetter(id: string) {
  safeReference(id, 'JIRA_INBOUND_EVENT_ID_INVALID');
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_INBOUND_DATABASE_UNAVAILABLE');
  const updated = await prisma.jiraInboundEvent.updateMany({
    where: { id, status: 'FAILED' },
    data: {
      status: 'DEAD_LETTER',
      leaseToken: null,
      leaseUntil: null,
      lastFailureCode: 'JIRA_MANUAL_DEAD_LETTER',
    },
  });
  if (updated.count !== 1) throw new Error('JIRA_INBOUND_FAILED_EVENT_NOT_FOUND');
}

export async function inspectJiraInboundEvents(status?: JiraInboundEventRecord['status']) {
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_INBOUND_DATABASE_UNAVAILABLE');
  return prisma.jiraInboundEvent.findMany({
    where: status ? { status } : undefined,
    select: {
      id: true,
      eventType: true,
      jiraIssueKey: true,
      companyId: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      nextAttemptAt: true,
      leaseUntil: true,
      lastFailureCode: true,
      correlationId: true,
      occurredAt: true,
      receivedAt: true,
    },
    orderBy: { receivedAt: 'asc' },
    take: 100,
  });
}

export async function deleteExpiredJiraInboundEvents(retentionDays: number, now = new Date()) {
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    throw new Error('JIRA_INBOUND_RETENTION_INVALID');
  }
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_INBOUND_DATABASE_UNAVAILABLE');
  return prisma.jiraInboundEvent.deleteMany({
    where: {
      status: { in: ['COMPLETED', 'IGNORED', 'DEAD_LETTER'] },
      receivedAt: { lt: new Date(now.getTime() - retentionDays * 24 * 60 * 60_000) },
    },
  });
}
