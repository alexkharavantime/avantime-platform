import { NextResponse } from 'next/server';

import { beginTotpEnrollment } from '../../../../../../../lib/identity-management';
import { getIdentityRateLimiter } from '../../../../../../../lib/identity-rate-limit';
import {
  identityCorrelationId,
  parseIdentityMutation,
} from '../../../../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../../../../lib/identity-security-events';
import { authorizePortalApi } from '../../../../../../../lib/portal-session';

export async function POST(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  try {
    const allowed = await getIdentityRateLimiter().consume({
      scope: 'mfa-enrollment',
      subject: authorization.session.userId,
      limit: 5,
      windowSeconds: 15 * 60,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Слишком много попыток. Повторите позже.' },
        { status: 429 },
      );
    }
    const enrollment = await beginTotpEnrollment(authorization.session);
    await recordIdentitySecurityEvent({
      context: {
        userId: authorization.session.userId,
        companyId: authorization.session.companyId ?? null,
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
