import { createHmac, timingSafeEqual } from 'node:crypto';

import { getPrisma } from '@avantime/database';
import type { Prisma } from '@prisma/client';

import {
  isJiraAutomationAuthor,
  jiraEventFingerprint,
  projectAdfToSafeText,
  safeJiraAuthor,
  safeProviderReference,
  type NormalizedJiraInboundPayload,
} from './jira-sync-policy';
import {
  loadJiraWebhookConfiguration,
  type JiraWebhookConfiguration,
  type JiraWebhookEventType,
} from './jira-webhook-configuration';

type WebhookObject = Record<string, unknown>;

export type JiraWebhookIngestResult =
  | { outcome: 'accepted'; eventId: string; duplicate: false }
  | { outcome: 'duplicate'; eventId: string; duplicate: true }
  | { outcome: 'ignored'; reason: 'unsupported_event' | 'unknown_issue' };

export class JiraWebhookError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(code);
  }
}

function object(value: unknown, code: string): WebhookObject {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new JiraWebhookError(code, 400);
  return value as WebhookObject;
}

function date(value: unknown, code: string) {
  const parsed =
    typeof value === 'number'
      ? new Date(value)
      : typeof value === 'string'
        ? new Date(value)
        : new Date(Number.NaN);
  if (Number.isNaN(parsed.getTime())) throw new JiraWebhookError(code, 400);
  return parsed;
}

function verifyPayloadSize(rawBody: string, configuration: JiraWebhookConfiguration) {
  if (Buffer.byteLength(rawBody, 'utf8') > configuration.maximumPayloadBytes) {
    throw new JiraWebhookError('JIRA_WEBHOOK_PAYLOAD_TOO_LARGE', 413);
  }
}

export function createJiraWebhookSignature(secret: string, rawBody: string) {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

export function verifyJiraWebhookSignature(input: {
  secret: string;
  rawBody: string;
  signature: string | null;
}) {
  if (!input.signature || !/^sha256=[a-f0-9]{64}$/u.test(input.signature)) {
    throw new JiraWebhookError('JIRA_WEBHOOK_SIGNATURE_INVALID', 401);
  }
  const expected = Buffer.from(createJiraWebhookSignature(input.secret, input.rawBody), 'utf8');
  const provided = Buffer.from(input.signature, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new JiraWebhookError('JIRA_WEBHOOK_SIGNATURE_INVALID', 401);
  }
}

function jiraOrigin(issue: WebhookObject, payload: WebhookObject) {
  const source = typeof issue.self === 'string' ? issue.self : payload.baseUrl;
  if (typeof source !== 'string') throw new JiraWebhookError('JIRA_WEBHOOK_TENANT_MISSING', 403);
  try {
    return new URL(source).origin;
  } catch {
    throw new JiraWebhookError('JIRA_WEBHOOK_TENANT_INVALID', 403);
  }
}

function explicitPublicComment(comment: WebhookObject) {
  if (comment.jsdPublic === true || comment.public === true) return true;
  if (!Array.isArray(comment.properties)) return false;
  return comment.properties.some((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const property = value as WebhookObject;
    if (property.key !== 'sd.public.comment') return false;
    if (property.value === true) return true;
    return (
      property.value !== null &&
      typeof property.value === 'object' &&
      !Array.isArray(property.value) &&
      (property.value as WebhookObject).internal === false
    );
  });
}

function normalizeEvent(
  payload: WebhookObject,
  eventType: JiraWebhookEventType,
  occurredAt: Date,
): NormalizedJiraInboundPayload {
  const issue = object(payload.issue, 'JIRA_WEBHOOK_ISSUE_INVALID');
  const fields =
    issue.fields && typeof issue.fields === 'object' && !Array.isArray(issue.fields)
      ? (issue.fields as WebhookObject)
      : {};
  const updatedAt = date(
    fields.updated ?? occurredAt.toISOString(),
    'JIRA_WEBHOOK_UPDATED_AT_INVALID',
  );
  if (eventType === 'jira:issue_deleted') {
    return { kind: 'ISSUE_DELETED', jiraUpdatedAt: updatedAt.toISOString() };
  }
  if (eventType === 'jira:issue_updated') {
    const status = object(fields.status, 'JIRA_WEBHOOK_STATUS_INVALID');
    return {
      kind: 'STATUS',
      statusId: safeProviderReference(status.id, 'JIRA_WEBHOOK_STATUS_ID_INVALID'),
      statusName:
        typeof status.name === 'string' && status.name.trim()
          ? status.name.normalize('NFKC').trim().slice(0, 160)
          : (() => {
              throw new JiraWebhookError('JIRA_WEBHOOK_STATUS_NAME_INVALID', 400);
            })(),
      jiraUpdatedAt: updatedAt.toISOString(),
    };
  }
  const comment = object(payload.comment, 'JIRA_WEBHOOK_COMMENT_INVALID');
  const author = comment.updateAuthor ?? comment.author;
  const publicComment = explicitPublicComment(comment);
  const automation = isJiraAutomationAuthor(author);
  return {
    kind: 'COMMENT',
    commentId: safeProviderReference(comment.id, 'JIRA_WEBHOOK_COMMENT_ID_INVALID'),
    body: publicComment && !automation ? projectAdfToSafeText(comment.body) : '[withheld]',
    authorName: safeJiraAuthor(author),
    public: publicComment,
    automation,
    jiraUpdatedAt: date(
      comment.updated ?? comment.created ?? occurredAt.toISOString(),
      'JIRA_WEBHOOK_COMMENT_DATE_INVALID',
    ).toISOString(),
  };
}

function providerEventId(
  payload: WebhookObject,
  eventType: string,
  normalized: NormalizedJiraInboundPayload,
  occurredAt: Date,
) {
  const explicit = payload.webhookEventId ?? payload.eventId;
  if (typeof explicit === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/u.test(explicit)) {
    return explicit;
  }
  const changelog =
    payload.changelog && typeof payload.changelog === 'object' && !Array.isArray(payload.changelog)
      ? (payload.changelog as WebhookObject)
      : null;
  const entity = normalized.kind === 'COMMENT' ? normalized.commentId : changelog?.id;
  return `${eventType}:${String(entity ?? occurredAt.getTime())}:${occurredAt.getTime()}`.slice(
    0,
    200,
  );
}

async function appendWebhookAudit(input: {
  transaction: Prisma.TransactionClient;
  companyId: string;
  requestPublicId: string;
  jiraIssueKey: string;
  correlationId: string;
  action: 'jira.webhook.received' | 'jira.webhook.duplicate';
  fingerprint: string;
}) {
  await input.transaction.productionAuditEvent.create({
    data: {
      companyId: input.companyId,
      actorId: null,
      action: input.action,
      targetType: 'support_request',
      targetId: input.requestPublicId,
      result: 'SUCCEEDED',
      correlationId: input.correlationId,
      safeMetadata: {
        requestId: input.requestPublicId,
        jiraIssueKey: input.jiraIssueKey,
        eventFingerprintPrefix: input.fingerprint.slice(0, 12),
      },
    },
  });
}

export async function ingestJiraWebhook(input: {
  rawBody: string;
  signature: string | null;
  now?: Date;
  environment?: Record<string, string | undefined>;
}): Promise<JiraWebhookIngestResult> {
  const configuration = loadJiraWebhookConfiguration(input.environment ?? process.env);
  if (!configuration.enabled || !configuration.secret || !configuration.allowedOrigin) {
    throw new JiraWebhookError('JIRA_WEBHOOK_DISABLED', 404);
  }
  verifyPayloadSize(input.rawBody, configuration);
  verifyJiraWebhookSignature({
    secret: configuration.secret,
    rawBody: input.rawBody,
    signature: input.signature,
  });
  let payload: WebhookObject;
  try {
    payload = object(JSON.parse(input.rawBody), 'JIRA_WEBHOOK_JSON_INVALID');
  } catch (error) {
    if (error instanceof JiraWebhookError) throw error;
    throw new JiraWebhookError('JIRA_WEBHOOK_JSON_INVALID', 400);
  }
  const eventType = typeof payload.webhookEvent === 'string' ? payload.webhookEvent : '';
  if (!configuration.enabledEvents.has(eventType as JiraWebhookEventType)) {
    return { outcome: 'ignored', reason: 'unsupported_event' };
  }
  const issue = object(payload.issue, 'JIRA_WEBHOOK_ISSUE_INVALID');
  const origin = jiraOrigin(issue, payload);
  if (origin !== configuration.allowedOrigin) {
    throw new JiraWebhookError('JIRA_WEBHOOK_TENANT_DENIED', 403);
  }
  const now = input.now ?? new Date();
  const occurredAt = date(payload.timestamp, 'JIRA_WEBHOOK_TIMESTAMP_INVALID');
  if (Math.abs(now.getTime() - occurredAt.getTime()) > configuration.replayWindowMs) {
    throw new JiraWebhookError('JIRA_WEBHOOK_REPLAY_EXPIRED', 409);
  }
  const issueId = safeProviderReference(issue.id, 'JIRA_WEBHOOK_ISSUE_ID_INVALID');
  const issueKey = safeProviderReference(issue.key, 'JIRA_WEBHOOK_ISSUE_KEY_INVALID');
  const normalized = normalizeEvent(payload, eventType as JiraWebhookEventType, occurredAt);
  const fingerprint = jiraEventFingerprint(origin, input.rawBody);
  const correlationId = `jira-hook-${fingerprint.slice(0, 32)}`;
  const prisma = await getPrisma();
  if (!prisma) throw new JiraWebhookError('JIRA_WEBHOOK_DATABASE_UNAVAILABLE', 503);
  const request = await prisma.supportRequest.findFirst({
    where: { jiraIssueId: issueId, jiraKey: issueKey },
    select: { id: true, publicId: true, companyId: true },
  });
  if (!request) return { outcome: 'ignored', reason: 'unknown_issue' };
  try {
    return await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const event = await transaction.jiraInboundEvent.create({
        data: {
          providerEventId: providerEventId(payload, eventType, normalized, occurredAt),
          eventFingerprint: fingerprint,
          eventType,
          jiraTenantOrigin: origin,
          jiraIssueId: issueId,
          jiraIssueKey: issueKey,
          requestId: request.id,
          companyId: request.companyId,
          normalizedPayload: normalized,
          occurredAt,
          maxAttempts: configuration.maximumAttempts,
          correlationId,
        },
      });
      await appendWebhookAudit({
        transaction,
        companyId: request.companyId,
        requestPublicId: request.publicId,
        jiraIssueKey: issueKey,
        correlationId,
        action: 'jira.webhook.received',
        fingerprint,
      });
      return { outcome: 'accepted', eventId: event.id, duplicate: false } as const;
    });
  } catch (error) {
    if ((error as { code?: unknown }).code !== 'P2002') throw error;
    const existing = await prisma.jiraInboundEvent.findFirstOrThrow({
      where: {
        OR: [
          { eventFingerprint: fingerprint },
          {
            jiraTenantOrigin: origin,
            providerEventId: providerEventId(payload, eventType, normalized, occurredAt),
          },
        ],
      },
      select: { id: true },
    });
    await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      await appendWebhookAudit({
        transaction,
        companyId: request.companyId,
        requestPublicId: request.publicId,
        jiraIssueKey: issueKey,
        correlationId,
        action: 'jira.webhook.duplicate',
        fingerprint,
      });
    });
    return { outcome: 'duplicate', eventId: existing.id, duplicate: true };
  }
}
