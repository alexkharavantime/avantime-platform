import { getPrisma } from '@avantime/database';
import { NextResponse } from 'next/server';

import { governanceMutationOriginAllowed } from '../../../../../lib/governance-request-security';
import { createJiraWebhookSignature, ingestJiraWebhook } from '../../../../../lib/jira-webhook';
import { loadJiraWebhookConfiguration } from '../../../../../lib/jira-webhook-configuration';
import { authorizeOrganizationApi } from '../../../../../lib/organization-authorization';

export async function POST(request: Request) {
  if (process.env.IDENTITY_TEST_MODE !== 'browser' || process.env.JIRA_WEBHOOK_MODE !== 'test') {
    return NextResponse.json({ error: 'Ресурс не найден.' }, { status: 404 });
  }
  if (!governanceMutationOriginAllowed(request)) {
    return NextResponse.json({ error: 'Источник запроса не разрешён.' }, { status: 403 });
  }
  const authorization = await authorizeOrganizationApi('requests.create', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const input = (await request.json()) as {
    requestId?: unknown;
    type?: unknown;
    statusName?: unknown;
    commentBody?: unknown;
    public?: unknown;
    commentId?: unknown;
    timestamp?: unknown;
  };
  if (typeof input.requestId !== 'string') {
    return NextResponse.json({ error: 'Некорректное обращение.' }, { status: 400 });
  }
  const prisma = await getPrisma();
  if (!prisma) return NextResponse.json({ error: 'Сервис недоступен.' }, { status: 503 });
  const item = await prisma.supportRequest.findFirst({
    where: { publicId: input.requestId, companyId: authorization.session.companyId },
  });
  if (!item?.jiraIssueId || !item.jiraKey) {
    return NextResponse.json({ error: 'Связь Jira не найдена.' }, { status: 404 });
  }
  const configuration = loadJiraWebhookConfiguration();
  if (!configuration.secret || !configuration.allowedOrigin) {
    return NextResponse.json({ error: 'Webhook не настроен.' }, { status: 503 });
  }
  const timestamp = typeof input.timestamp === 'number' ? input.timestamp : Date.now();
  const base = {
    timestamp,
    issue: {
      id: item.jiraIssueId,
      key: item.jiraKey,
      self: `${configuration.allowedOrigin}/rest/api/3/issue/${encodeURIComponent(item.jiraIssueId)}`,
      fields: { updated: new Date(timestamp).toISOString() },
    },
  };
  const payload =
    input.type === 'comment'
      ? {
          ...base,
          webhookEvent: 'comment_created',
          comment: {
            id:
              typeof input.commentId === 'string'
                ? input.commentId
                : `comment-${crypto.randomUUID()}`,
            body: typeof input.commentBody === 'string' ? input.commentBody : 'Test public update',
            jsdPublic: input.public === true,
            author: { displayName: 'Avantime support specialist', accountType: 'atlassian' },
            created: new Date(timestamp).toISOString(),
            updated: new Date(timestamp).toISOString(),
          },
        }
      : {
          ...base,
          webhookEvent: 'jira:issue_updated',
          issue: {
            ...base.issue,
            fields: {
              ...base.issue.fields,
              status: {
                id: 'status-test',
                name: typeof input.statusName === 'string' ? input.statusName : 'In Progress',
              },
            },
          },
          changelog: { id: `change-${timestamp}` },
        };
  const rawBody = JSON.stringify(payload);
  const result = await ingestJiraWebhook({
    rawBody,
    signature: createJiraWebhookSignature(configuration.secret, rawBody),
  });
  return NextResponse.json(result, { status: 202 });
}
