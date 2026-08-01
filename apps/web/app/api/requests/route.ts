import { NextResponse } from 'next/server';
import { createRequest, listRequests, type RequestPriority } from '../../../lib/requests-store';
import { createJiraIssue } from '../../../lib/jira';
import { authorizeOrganizationApi } from '../../../lib/organization-authorization';

export async function GET(request: Request) {
  const authorization = await authorizeOrganizationApi('requests.view', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  return NextResponse.json({ requests: await listRequests(authorization.session) });
}

export async function POST(request: Request) {
  const authorization = await authorizeOrganizationApi('requests.create', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const session = authorization.session;
  if (!session.companyId)
    return NextResponse.json({ error: 'Для пользователя не указана компания.' }, { status: 403 });
  const body = (await request.json()) as {
    title?: string;
    description?: string;
    category?: string;
    priority?: RequestPriority;
  };
  if (!body.title?.trim() || !body.description?.trim() || !body.category?.trim())
    return NextResponse.json({ error: 'Заполните тему, категорию и описание.' }, { status: 400 });
  const input = {
    title: body.title.trim(),
    description: body.description.trim(),
    category: body.category.trim(),
    priority: body.priority ?? ('NORMAL' as RequestPriority),
  };
  let created;
  try {
    created = await createRequest(input, session);
  } catch {
    return NextResponse.json({ error: 'Не удалось создать обращение.' }, { status: 503 });
  }
  let jira = null;
  try {
    jira = await createJiraIssue(input);
  } catch (error) {
    console.error('Jira synchronization failed.', error);
  }
  return NextResponse.json({ request: created, jira }, { status: 201 });
}
