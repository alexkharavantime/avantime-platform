import { NextResponse } from 'next/server';

import { changePassword } from '../../../../../lib/identity-management';
import { identityCorrelationId, parseIdentityMutation } from '../../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../../lib/identity-security-events';
import { authorizePortalApi } from '../../../../../lib/portal-session';
import { expiredSessionCookieOptions, SESSION_COOKIE } from '../../../../../lib/session';

export async function POST(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const currentPassword =
    typeof parsed.body.currentPassword === 'string' ? parsed.body.currentPassword : '';
  const newPassword = typeof parsed.body.newPassword === 'string' ? parsed.body.newPassword : '';
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Заполните оба поля пароля.' }, { status: 400 });
  }
  try {
    const result = await changePassword(authorization.session, currentPassword, newPassword);
    if (!result.valid) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
    }
    await recordIdentitySecurityEvent({
      context: {
        userId: authorization.session.userId,
        companyId: authorization.session.companyId ?? null,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.password.changed',
      result: 'SUCCEEDED',
      notify: true,
    });
    const response = NextResponse.json({ success: true, signedOut: true });
    response.cookies.set(SESSION_COOKIE, '', expiredSessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json(
      { error: 'Текущий пароль неверен или операция недоступна.' },
      { status: 400 },
    );
  }
}
