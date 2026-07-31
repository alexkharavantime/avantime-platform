import { NextResponse } from 'next/server';

import { getSecurityOverview } from '../../../../lib/identity-management';
import { authorizePortalApi } from '../../../../lib/portal-session';

export async function GET() {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  try {
    const response = NextResponse.json(await getSecurityOverview(authorization.session));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json(
      { error: 'Настройки безопасности временно недоступны.' },
      { status: 503 },
    );
  }
}
