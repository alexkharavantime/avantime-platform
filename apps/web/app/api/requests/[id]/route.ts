import { NextResponse } from 'next/server';
import { getRequest } from '../../../../lib/requests-store';
import { getSession } from '../../../../lib/session';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const item = await getRequest(id, session);
  if (!item) return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 });
  return NextResponse.json({ request: item });
}
