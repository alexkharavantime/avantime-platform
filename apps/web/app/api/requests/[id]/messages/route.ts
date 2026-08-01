import { NextResponse } from 'next/server';
import { authorizeOrganizationApi } from '../../../../../lib/organization-authorization';
import { addRequestMessage } from '../../../../../lib/requests-store';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOrganizationApi('requests.comment', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const { id } = await context.params;
  const body = (await request.json()) as { body?: string };
  if (!body.body?.trim())
    return NextResponse.json({ error: 'Введите сообщение.' }, { status: 400 });
  const item = await addRequestMessage(id, body.body.trim(), authorization.session);
  if (!item) return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 });
  return NextResponse.json({ request: item }, { status: 201 });
}
