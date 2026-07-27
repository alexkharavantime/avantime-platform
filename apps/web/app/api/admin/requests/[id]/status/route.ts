import { NextResponse } from 'next/server';
import { authorizeApi } from '../../../../../../lib/authorization';
import { updateRequestStatus, type RequestStatus } from '../../../../../../lib/requests-store';

const allowed: RequestStatus[] = ['NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED'];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeApi(['ADMIN']);
  if (authorization.response) return authorization.response;

  const body = (await request.json()) as { status?: RequestStatus };
  if (!body.status || !allowed.includes(body.status)) {
    return NextResponse.json({ error: 'Некорректный статус.' }, { status: 400 });
  }

  const { id } = await context.params;
  const item = await updateRequestStatus(id, body.status);
  if (!item) return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 });
  return NextResponse.json({ request: item });
}
