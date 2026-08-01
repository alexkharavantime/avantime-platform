import { NextResponse } from 'next/server';

import { authorizePlatformApi } from '../../../../../lib/platform-authorization';
import { startPlatformSupportSession } from '../../../../../lib/platform-support';

export async function POST(request: Request) {
  const authorization = await authorizePlatformApi('platform.support.session.start');
  if (authorization.response) return authorization.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.companyId !== 'string' ||
    typeof body.reasonCode !== 'string' ||
    typeof body.ticketReference !== 'string' ||
    !Array.isArray(body.allowedScopes)
  ) {
    return NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 });
  }
  try {
    const supportSession = await startPlatformSupportSession({
      session: authorization.session,
      companyId: body.companyId,
      reasonCode: body.reasonCode,
      ticketReference: body.ticketReference,
      allowedScopes: body.allowedScopes.filter(
        (scope): scope is string => typeof scope === 'string',
      ),
    });
    return NextResponse.json(
      { id: supportSession.id, expiresAt: supportSession.expiresAt },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Support-сессия не создана.' }, { status: 403 });
  }
}
