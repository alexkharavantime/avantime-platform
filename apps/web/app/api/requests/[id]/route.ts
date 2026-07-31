import { NextResponse } from 'next/server';
import { authorizeOrganizationApi } from '../../../../lib/organization-authorization';
import { getRequest } from '../../../../lib/requests-store';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOrganizationApi('requests.view', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const { id } = await context.params;
  const item = await getRequest(id, authorization.session);
  if (!item) return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 });
  return NextResponse.json({ request: item });
}
