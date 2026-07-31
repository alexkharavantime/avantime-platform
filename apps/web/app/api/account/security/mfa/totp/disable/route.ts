import { NextResponse } from 'next/server';

import { disableTotp } from '../../../../../../../lib/identity-management';
import {
  identityCorrelationId,
  parseIdentityMutation,
} from '../../../../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../../../../lib/identity-security-events';
import { authorizePortalApi } from '../../../../../../../lib/portal-session';
import { expiredSessionCookieOptions, SESSION_COOKIE } from '../../../../../../../lib/session';

export async function POST(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const code = typeof parsed.body.code === 'string' ? parsed.body.code.trim() : '';
  if (!code) {
    return NextResponse.json({ error: 'Укажите код подтверждения.' }, { status: 400 });
  }
  try {
    await disableTotp(authorization.session, code);
    await recordIdentitySecurityEvent({
      context: {
        userId: authorization.session.userId,
        companyId: authorization.session.companyId ?? null,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.mfa.disabled',
      result: 'SUCCEEDED',
      metadata: { method: 'TOTP' },
      notify: true,
    });
    const response = NextResponse.json({ success: true, signedOut: true });
    response.cookies.set(SESSION_COOKIE, '', expiredSessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: 'Не удалось отключить MFA.' }, { status: 400 });
  }
}
