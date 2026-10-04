import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  beginTotpEnrollment,
  beginTotpEnrollmentForChallenge,
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
  try {
    const allowed = await getIdentityRateLimiter().consume({
      scope: 'mfa-enrollment',
      subject: userId,
      limit: 5,
      windowSeconds: 15 * 60,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Слишком много попыток. Повторите позже.' },
        { status: 429 },
      );
    }
    const enrollment = restricted
      ? await beginTotpEnrollmentForChallenge(restricted)
      : await beginTotpEnrollment(authorization.session!);
    await recordIdentitySecurityEvent({
      context: {
        userId,
        companyId: restricted?.companyId ?? authorization.session?.companyId ?? null,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.mfa.enrollment_started',
      result: 'SUCCEEDED',
      metadata: { method: 'TOTP' },
    });
    const response = NextResponse.json(enrollment, { status: 201 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ error: 'Не удалось начать подключение MFA.' }, { status: 409 });
  }
}
