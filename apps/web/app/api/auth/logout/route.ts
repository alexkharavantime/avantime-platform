import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { isSameOriginMutation } from '../../../../lib/identity-auth';
import { recordIdentitySecurityEvent } from '../../../../lib/identity-security-events';
import {
  expiredSessionCookieOptions,
  resolveSessionToken,
  revokeSessionToken,
  SESSION_COOKIE,
} from '../../../../lib/session';

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  }
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const session = await resolveSessionToken(token);
      await revokeSessionToken(token);
      if (session) {
        await recordIdentitySecurityEvent({
          context: {
            userId: session.userId,
            companyId: session.companyId ?? null,
            correlationId: request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID(),
          },
          action: 'identity.logout',
          result: 'SUCCEEDED',
          metadata: { sessionId: session.sessionId },
          notify: true,
        });
      }
    } catch {
      return NextResponse.json(
        { error: 'Не удалось завершить сессию. Повторите попытку.' },
        { status: 503 },
      );
    }
  }
  const response = NextResponse.redirect(new URL('/portal/login', request.url), 303);
  response.cookies.set(SESSION_COOKIE, '', expiredSessionCookieOptions());
  return response;
}
