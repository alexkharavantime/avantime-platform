import { NextResponse } from 'next/server';
import { addAttachment, listAttachments } from '../../../../../lib/attachments';
import { getSession } from '../../../../../lib/session';
import { getRequest } from '../../../../../lib/requests-store';

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  if (!(await getRequest(id, session))) return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 });
  return NextResponse.json({ attachments: await listAttachments(id) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  if (!(await getRequest(id, session))) return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Файл не указан или превышает 10 МБ.' }, { status: 400 });
  return NextResponse.json({ attachment: await addAttachment(id, file) }, { status: 201 });
}
