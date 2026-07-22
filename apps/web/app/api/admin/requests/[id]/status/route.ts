import { NextResponse } from 'next/server';
import { getSession } from '../../../../../../lib/session';
import { updateRequestStatus, type RequestStatus } from '../../../../../../lib/requests-store';

const allowed: RequestStatus[] = ['NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED'];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json()) as { status?: RequestStatus };
  if (!body.status || !allowed.includes(body.status)) {
    return NextResponse.json({ error: 'Некорректный статус.' }, { status: 400 });
  }

  const { id } = await context.params;
  const item = await updateRequestStatus(id, body.status);
  if (!item) return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 });
  return NextResponse.json({ request: item });
}
