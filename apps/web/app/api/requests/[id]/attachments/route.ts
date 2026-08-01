import { NextResponse } from 'next/server';
import { addAttachment, listAttachments } from '../../../../../lib/attachments';
import { authorizeOrganizationApi } from '../../../../../lib/organization-authorization';
import { getRequest } from '../../../../../lib/requests-store';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOrganizationApi('requests.view', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const { id } = await context.params;
  if (!(await getRequest(id, authorization.session)))
    return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 });
  return NextResponse.json({ attachments: await listAttachments(id) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOrganizationApi('requests.comment', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const { id } = await context.params;
  if (!(await getRequest(id, authorization.session)))
    return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'Файл не указан или превышает 10 МБ.' }, { status: 400 });
  return NextResponse.json({ attachment: await addAttachment(id, file) }, { status: 201 });
}
