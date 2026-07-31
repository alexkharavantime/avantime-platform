import { NextResponse } from 'next/server';

import { revokeOwnSession } from '../../../../../../lib/identity-management';
import { identityCorrelationId, parseIdentityMutation } from '../../../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../../../lib/identity-security-events';
import { authorizePortalApi } from '../../../../../../lib/portal-session';
import { expiredSessionCookieOptions, SESSION_COOKIE } from '../../../../../../lib/session';

export async function POST(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const sessionId = typeof parsed.body.sessionId === 'string' ? parsed.body.sessionId.trim() : '';
  if (!sessionId) {
    return NextResponse.json({ error: 'Сессия не указана.' }, { status: 400 });
  }
  try {
    const currentRevoked = await revokeOwnSession(authorization.session, sessionId);
    await recordIdentitySecurityEvent({
      context: {
        userId: authorization.session.userId,
        companyId: authorization.session.companyId ?? null,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.session.revoked',
      result: 'SUCCEEDED',
      metadata: { sessionId },
      notify: true,
    });
    const response = NextResponse.json({ success: true, signedOut: currentRevoked });
    if (currentRevoked) {
      response.cookies.set(SESSION_COOKIE, '', expiredSessionCookieOptions());
    }
    return response;
  } catch {
    return NextResponse.json({ error: 'Сессия не найдена.' }, { status: 404 });
  }
}
