import { createHash } from 'node:crypto';

import { getPrisma } from '@avantime/database';
import { NextResponse } from 'next/server';

import { JiraWebhookError, ingestJiraWebhook } from '../../../../../lib/jira-webhook';
import { loadJiraWebhookConfiguration } from '../../../../../lib/jira-webhook-configuration';

export const runtime = 'nodejs';

async function withWebhookTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new JiraWebhookError('JIRA_WEBHOOK_TIMEOUT', 503)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function auditRejection(code: string, rawBody: string) {
  const prisma = await getPrisma().catch(() => null);
  if (!prisma) return;
  const fingerprint = createHash('sha256').update(rawBody).digest('hex');
  await prisma.productionAuditEvent
    .create({
      data: {
        companyId: null,
        actorId: null,
        action: 'jira.webhook.rejected',
        targetType: 'jira_webhook',
        targetId: null,
        result: 'DENIED',
        correlationId: `jira-reject-${fingerprint.slice(0, 32)}`,
        safeMetadata: { errorCode: code, eventFingerprintPrefix: fingerprint.slice(0, 12) },
      },
    })
    .catch(() => undefined);
}

export async function POST(request: Request) {
  let rawBody = '';
  try {
    const configuration = loadJiraWebhookConfiguration();
    if (!configuration.enabled) throw new JiraWebhookError('JIRA_WEBHOOK_DISABLED', 404);
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > configuration.maximumPayloadBytes) {
      throw new JiraWebhookError('JIRA_WEBHOOK_PAYLOAD_TOO_LARGE', 413);
    }
    rawBody = await request.text();
    const result = await withWebhookTimeout(
      ingestJiraWebhook({
        rawBody,
        signature: request.headers.get('x-hub-signature'),
      }),
      configuration.timeoutMs,
    );
    return NextResponse.json(
      result.outcome === 'accepted' || result.outcome === 'duplicate'
        ? { accepted: true, duplicate: result.duplicate }
        : { accepted: true, ignored: true, reason: result.reason },
      { status: result.outcome === 'accepted' ? 202 : 200 },
    );
  } catch (error) {
    const webhookError =
      error instanceof JiraWebhookError
        ? error
        : new JiraWebhookError('JIRA_WEBHOOK_REJECTED', 400);
    await auditRejection(webhookError.code, rawBody);
    return NextResponse.json(
      { error: 'Webhook rejected.', code: webhookError.code },
      { status: webhookError.httpStatus },
    );
  }
}
