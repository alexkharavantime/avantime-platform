import { NextResponse } from 'next/server';
import { authorizePortalApi } from '../../../../lib/portal-session';
import { getRequest } from '../../../../lib/requests-store';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const { id } = await context.params;
  const item = await getRequest(id, authorization.session);
  if (!item) return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 });
  return NextResponse.json({ request: item });
}
