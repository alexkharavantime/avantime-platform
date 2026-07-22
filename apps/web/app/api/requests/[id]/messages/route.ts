import { NextResponse } from 'next/server';
import { addRequestMessage } from '../../../../../lib/requests-store';
import { getSession } from '../../../../../lib/session';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json()) as { body?: string };
  if (!body.body?.trim()) return NextResponse.json({ error: 'Введите сообщение.' }, { status: 400 });
  const item = await addRequestMessage(id, body.body.trim(), session.name);
  if (!item) return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 });
  return NextResponse.json({ request: item }, { status: 201 });
}
