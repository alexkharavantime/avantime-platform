import { randomUUID } from 'node:crypto';

import { getPrisma } from '@avantime/database';
import type { Prisma } from '@prisma/client';

import {
  jiraFailure,
  JiraProviderError,
  projectJiraCreateIssue,
  type JiraProviderAdapter,
} from './jira';

const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/u;
const SAFE_FAILURE_CODE = /^[A-Z0-9][A-Z0-9_-]{2,99}$/u;

export type JiraOperationRecord = {
  id: string;
  requestId: string;
  companyId: string;
  mappingId: string;
  mappingVersion: number;
  operationType: 'CREATE_ISSUE';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER';
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  leaseToken: string | null;
  leaseUntil: Date | null;
  idempotencyKey: string;
  correlationId: string;
  projectKey: string;
  issueType: string;
  componentId: string | null;
  requestType: string | null;
  providerIssueId: string | null;
  providerIssueKey: string | null;
  lastFailureCode: string | null;
  completedAt: Date | null;
};

async function databaseNow(prisma: {
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
}) {
  const rows = (await prisma.$queryRaw`SELECT CURRENT_TIMESTAMP AS "now"`) as Array<{ now: Date }>;
  const now = rows[0]?.now;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('JIRA_DATABASE_TIME_INVALID');
  }
  return now;
}

function safeReference(value: string, name: string) {
  if (!SAFE_REFERENCE.test(value)) throw new Error(`JIRA_${name}_INVALID`);
  return value;
}

export function jiraBackoffMs(attempt: number, baseMs = 1_000, maximumMs = 300_000) {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 20) {
    throw new Error('JIRA_ATTEMPT_INVALID');
  }
  return Math.min(maximumMs, baseMs * 2 ** (attempt - 1));
}

export async function claimJiraOperations(input: {
  batchSize: number;
  leaseMs: number;
  now?: Date;
  correlationId?: string;
}) {
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 100) {
    throw new Error('JIRA_BATCH_SIZE_INVALID');
  }
  if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1_000 || input.leaseMs > 600_000) {
    throw new Error('JIRA_LEASE_INVALID');
  }
  const correlationId = input.correlationId
    ? safeReference(input.correlationId, 'CORRELATION')
    : null;
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_DATABASE_UNAVAILABLE');
  const now = input.now ?? (await databaseNow(prisma));
  const leaseToken = randomUUID();
  const leaseUntil = new Date(now.getTime() + input.leaseMs);
  return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    await transaction.$executeRaw`
      WITH exhausted AS (
        UPDATE "JiraOperation"
        SET "status" = 'DEAD_LETTER', "lastFailureCode" = 'JIRA_LEASE_EXHAUSTED',
            "leaseToken" = NULL, "leaseUntil" = NULL, "updatedAt" = ${now}
        WHERE "status" = 'PROCESSING' AND "leaseUntil" <= ${now} AND "attempts" >= "maxAttempts"
        RETURNING "requestId"
      )
      UPDATE "SupportRequest" AS request
      SET "jiraIntegrationStatus" = 'DEAD_LETTER', "updatedAt" = ${now}
      FROM exhausted
      WHERE request."id" = exhausted."requestId"
    `;
    const records = (await transaction.$queryRaw`
      WITH candidates AS (
        SELECT "id"
        FROM "JiraOperation"
        WHERE "attempts" < "maxAttempts"
          AND (${correlationId}::TEXT IS NULL OR "correlationId" = ${correlationId})
          AND (
            ("status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= ${now})
            OR ("status" = 'PROCESSING' AND "leaseUntil" <= ${now})
          )
        ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.batchSize}
      )
      UPDATE "JiraOperation" AS operation
      SET "status" = 'PROCESSING', "attempts" = operation."attempts" + 1,
          "leaseToken" = ${leaseToken}, "leaseUntil" = ${leaseUntil},
          "lastFailureCode" = NULL, "updatedAt" = ${now}
      FROM candidates
      WHERE operation."id" = candidates."id"
      RETURNING operation.*
    `) as JiraOperationRecord[];
    await transaction.$executeRaw`
      UPDATE "SupportRequest" AS request
      SET "jiraIntegrationStatus" = 'PROCESSING', "updatedAt" = ${now}
      FROM "JiraOperation" AS operation
      WHERE request."id" = operation."requestId" AND operation."leaseToken" = ${leaseToken}
    `;
    return records;
  });
}

function providerFailure(error: unknown) {
  if (
    error instanceof Error &&
    /^(?:JIRA_PAYLOAD_|JIRA_MAPPING_|JIRA_REQUEST_)/u.test(error.message) &&
    SAFE_FAILURE_CODE.test(error.message)
  ) {
    return { code: error.message, retryable: false };
  }
  return jiraFailure(error);
}

async function completeJiraOperation(
  record: JiraOperationRecord,
  result: { issueId: string; issueKey: string; issueUrl: string },
  now: Date,
) {
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_DATABASE_UNAVAILABLE');
  await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const updated = await transaction.jiraOperation.updateMany({
      where: { id: record.id, status: 'PROCESSING', leaseToken: record.leaseToken },
      data: {
        status: 'COMPLETED',
        providerIssueId: result.issueId,
        providerIssueKey: result.issueKey,
        completedAt: now,
        leaseToken: null,
        leaseUntil: null,
        lastFailureCode: null,
      },
    });
    if (updated.count !== 1) throw new Error('JIRA_LEASE_LOST');
    const request = await transaction.supportRequest.update({
      where: { id: record.requestId },
      data: {
        jiraIntegrationStatus: 'CREATED',
        jiraIssueId: result.issueId,
        jiraKey: result.issueKey,
        jiraIssueUrl: result.issueUrl,
        jiraSyncAt: now,
        version: { increment: 1 },
      },
    });
    await transaction.productionAuditEvent.create({
      data: {
        companyId: record.companyId,
        actorId: request.requesterId,
        action: 'jira.issue.created',
        targetType: 'support_request',
        targetId: request.publicId,
        result: 'SUCCEEDED',
        correlationId: record.correlationId,
        safeMetadata: { requestId: request.publicId, issueKey: result.issueKey },
      },
    });
    const href = `/portal/requests/${encodeURIComponent(request.publicId)}`;
    await transaction.portalNotification.create({
      data: {
        userId: request.requesterId,
        companyId: record.companyId,
        category: 'REQUEST',
        title: `Для обращения ${request.publicId} создана задача ${result.issueKey}`,
        href,
      },
    });
    await transaction.notificationOutbox.upsert({
      where: { idempotencyKey: `jira-created:${record.requestId}` },
      create: {
        idempotencyKey: `jira-created:${record.requestId}`,
        notificationType: 'JIRA_ISSUE_CREATED',
        recipientReference: `user:${request.requesterId}`,
        recipientUserId: request.requesterId,
        templateReference: 'jira-ticket-created-v1',
        correlationId: record.correlationId,
      },
      update: {},
    });
  });
}

async function failJiraOperation(
  record: JiraOperationRecord,
  failure: { code: string; retryable: boolean },
  now: Date,
) {
  const failureCode = failure.code.toUpperCase();
  if (!SAFE_FAILURE_CODE.test(failureCode)) throw new Error('JIRA_FAILURE_CODE_INVALID');
  const deadLettered = !failure.retryable || record.attempts >= record.maxAttempts;
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_DATABASE_UNAVAILABLE');
  await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const updated = await transaction.jiraOperation.updateMany({
      where: { id: record.id, status: 'PROCESSING', leaseToken: record.leaseToken },
      data: {
        status: deadLettered ? 'DEAD_LETTER' : 'FAILED',
        nextAttemptAt: deadLettered
          ? now
          : new Date(now.getTime() + jiraBackoffMs(record.attempts)),
        leaseToken: null,
        leaseUntil: null,
        lastFailureCode: failureCode,
      },
    });
    if (updated.count !== 1) throw new Error('JIRA_LEASE_LOST');
    const request = await transaction.supportRequest.update({
      where: { id: record.requestId },
      data: {
        jiraIntegrationStatus: deadLettered ? 'DEAD_LETTER' : 'FAILED',
        version: { increment: 1 },
      },
    });
    await transaction.productionAuditEvent.create({
      data: {
        companyId: record.companyId,
        actorId: request.requesterId,
        action: deadLettered ? 'jira.operation.dead_lettered' : 'jira.issue.create_failed',
        targetType: 'support_request',
        targetId: request.publicId,
        result: 'FAILED',
        correlationId: record.correlationId,
        safeMetadata: {
          requestId: request.publicId,
          errorCode: failureCode,
          attempt: record.attempts,
        },
      },
    });
  });
  return deadLettered;
}

export async function processJiraOperationBatch(input: {
  provider: JiraProviderAdapter;
  batchSize: number;
  leaseMs: number;
  now?: Date;
  correlationId?: string;
}) {
  const records = await claimJiraOperations(input);
  let completed = 0;
  let failed = 0;
  let deadLettered = 0;
  for (const record of records) {
    const now = input.now ?? new Date();
    try {
      if (!record.leaseToken) throw new JiraProviderError('JIRA_LEASE_MISSING', false);
      const prisma = await getPrisma();
      if (!prisma) throw new Error('JIRA_DATABASE_UNAVAILABLE');
      const [request, mapping] = await Promise.all([
        prisma.supportRequest.findUnique({ where: { id: record.requestId } }),
        prisma.jiraOrganizationMapping.findUnique({ where: { id: record.mappingId } }),
      ]);
      if (!request || request.companyId !== record.companyId) {
        throw new JiraProviderError('JIRA_REQUEST_UNAVAILABLE', false);
      }
      if (!mapping || mapping.companyId !== record.companyId || !mapping.enabled) {
        throw new JiraProviderError('JIRA_MAPPING_DISABLED', false);
      }
      const payload = projectJiraCreateIssue({
        requestId: request.publicId,
        subject: request.title,
        description: request.description,
        category: request.category,
        priority: request.priority,
        correlationId: record.correlationId,
        projectKey: record.projectKey,
        issueType: record.issueType,
        componentId: record.componentId,
        requestType: record.requestType,
        idempotencyKey: record.idempotencyKey,
      });
      const result = await input.provider.createIssue(payload, record.attempts);
      await completeJiraOperation(record, result, now);
      completed += 1;
    } catch (error) {
      const wasDeadLettered = await failJiraOperation(record, providerFailure(error), now);
      if (wasDeadLettered) deadLettered += 1;
      else failed += 1;
    }
  }
  return { claimed: records.length, completed, failed, deadLettered };
}

export async function retryJiraOperation(id: string, now = new Date()) {
  safeReference(id, 'OPERATION_ID');
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_DATABASE_UNAVAILABLE');
  await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const operation = await transaction.jiraOperation.findUnique({ where: { id } });
    if (!operation || operation.status !== 'DEAD_LETTER') {
      throw new Error('JIRA_DEAD_LETTER_NOT_FOUND');
    }
    await transaction.jiraOperation.update({
      where: { id },
      data: {
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: now,
        leaseToken: null,
        leaseUntil: null,
        lastFailureCode: null,
        providerIssueId: null,
        providerIssueKey: null,
        completedAt: null,
      },
    });
    const request = await transaction.supportRequest.update({
      where: { id: operation.requestId },
      data: { jiraIntegrationStatus: 'PENDING', version: { increment: 1 } },
    });
    await transaction.productionAuditEvent.create({
      data: {
        companyId: operation.companyId,
        actorId: null,
        action: 'jira.operation.retried',
        targetType: 'support_request',
        targetId: request.publicId,
        result: 'SUCCEEDED',
        correlationId: operation.correlationId,
        safeMetadata: { requestId: request.publicId },
      },
    });
  });
}

export async function moveFailedJiraOperationToDeadLetter(id: string, now = new Date()) {
  safeReference(id, 'OPERATION_ID');
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_DATABASE_UNAVAILABLE');
  return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const operation = await transaction.jiraOperation.findUnique({ where: { id } });
    if (!operation || operation.status !== 'FAILED')
      throw new Error('JIRA_FAILED_OPERATION_NOT_FOUND');
    await transaction.jiraOperation.update({
      where: { id },
      data: {
        status: 'DEAD_LETTER',
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: now,
        lastFailureCode: operation.lastFailureCode ?? 'JIRA_MANUAL_DEAD_LETTER',
      },
    });
    const request = await transaction.supportRequest.update({
      where: { id: operation.requestId },
      data: { jiraIntegrationStatus: 'DEAD_LETTER', version: { increment: 1 } },
    });
    await transaction.productionAuditEvent.create({
      data: {
        companyId: operation.companyId,
        actorId: null,
        action: 'jira.operation.dead_lettered',
        targetType: 'support_request',
        targetId: request.publicId,
        result: 'FAILED',
        correlationId: operation.correlationId,
        safeMetadata: {
          requestId: request.publicId,
          errorCode: operation.lastFailureCode ?? 'JIRA_MANUAL_DEAD_LETTER',
          attempt: operation.attempts,
        },
      },
    });
    return operation.id;
  });
}

export async function inspectJiraOperations(status?: JiraOperationRecord['status']) {
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_DATABASE_UNAVAILABLE');
  return prisma.jiraOperation.findMany({
    where: status ? { status } : undefined,
    select: {
      id: true,
      requestId: true,
      companyId: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      nextAttemptAt: true,
      leaseUntil: true,
      providerIssueKey: true,
      lastFailureCode: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
}
