import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  confirmTotpEnrollment,
  confirmTotpEnrollmentForChallenge,
} from '../../../../../../../lib/identity-management';
import { authorizeInitialMfaEnrollment } from '../../../../../../../lib/identity-auth';
import { getIdentityRateLimiter } from '../../../../../../../lib/identity-rate-limit';
import {
  identityCorrelationId,
  parseIdentityMutation,
} from '../../../../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../../../../lib/identity-security-events';
import { authorizePortalApi } from '../../../../../../../lib/portal-session';
import { MFA_ENROLLMENT_COOKIE } from '../../../../../../../lib/session-constants';
import {
  expiredMfaEnrollmentCookieOptions,
} from '../../../../../../../lib/session';

export async function POST(request: Request) {
  const authorization = await authorizePortalApi();
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const enrollmentToken = authorization.response
    ? (await cookies()).get(MFA_ENROLLMENT_COOKIE)?.value
    : undefined;
  const restricted = enrollmentToken
    ? await authorizeInitialMfaEnrollment(enrollmentToken)
    : null;
  if (authorization.response && !restricted) return authorization.response;
  const userId = restricted?.userId ?? authorization.session?.userId;
  if (!userId) return authorization.response ?? NextResponse.json({ error: 'Требуется авторизация.' }, { status: 401 });
  const methodId = typeof parsed.body.methodId === 'string' ? parsed.body.methodId.trim() : '';
  const code = typeof parsed.body.code === 'string' ? parsed.body.code.trim() : '';
  if (!methodId || !code) {
    return NextResponse.json({ error: 'Укажите код подтверждения.' }, { status: 400 });
  }
  try {
    const allowed = await getIdentityRateLimiter().consume({
      scope: 'mfa-enrollment',
      subject: userId,
      limit: 5,
      windowSeconds: 15 * 60,
    });
    if (!allowed) {
      return NextResponse.json({ error: 'Слишком много попыток. Повторите позже.' }, { status: 429 });
    }
    const result = restricted
      ? await confirmTotpEnrollmentForChallenge(restricted, methodId, code)
      : {
          recoveryCodes: await confirmTotpEnrollment(authorization.session!, methodId, code),
          userId,
          companyId: authorization.session?.companyId ?? null,
        };
    await recordIdentitySecurityEvent({
      context: {
        userId: result.userId,
        companyId: result.companyId,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.mfa.enabled',
      result: 'SUCCEEDED',
      metadata: { method: 'TOTP' },
      notify: true,
    });
    const response = NextResponse.json({ recoveryCodes: result.recoveryCodes });
    if (restricted) {
      response.cookies.set(MFA_ENROLLMENT_COOKIE, '', expiredMfaEnrollmentCookieOptions());
    }
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    await recordIdentitySecurityEvent({
      context: {
        userId,
        companyId: restricted?.companyId ?? authorization.session?.companyId ?? null,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.mfa.challenge_failed',
      result: 'FAILED',
      metadata: { method: 'TOTP', reasonCode: 'ENROLLMENT_CONFIRMATION_FAILED' },
    });
    return NextResponse.json(
      { error: 'Код подтверждения неверен или подключение истекло.' },
      { status: 400 },
    );
  }
}
