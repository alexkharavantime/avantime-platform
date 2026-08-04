import { NextResponse } from 'next/server';
import { authorizeOrganizationApi } from '../../../../../lib/organization-authorization';
import { addRequestMessage } from '../../../../../lib/requests-store';
import { validatePortalComment } from '../../../../../lib/jira-sync-policy';

const IDEMPOTENCY_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/u;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOrganizationApi('requests.comment', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const { id } = await context.params;
  try {
    const body = (await request.json()) as { body?: unknown };
    const message = validatePortalComment(body.body);
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return NextResponse.json({ error: 'Некорректный ключ запроса.' }, { status: 400 });
    }
    const correlationId = request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
    const item = await addRequestMessage(id, message, authorization.session, {
      idempotencyKey,
      correlationId,
    });
    if (!item) return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 });
    return NextResponse.json({ request: item }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'JIRA_COMMENT_INVALID';
    return NextResponse.json({ error: 'Комментарий не принят.', code }, { status: 400 });
  }
}
