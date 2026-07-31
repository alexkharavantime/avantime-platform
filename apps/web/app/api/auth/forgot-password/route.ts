import { NextResponse } from 'next/server';

import { isSameOriginMutation, normalizeIdentityEmail } from '../../../../lib/identity-auth';
import { getIdentityRateLimiter } from '../../../../lib/identity-rate-limit';
import { recordIdentitySecurityEvent } from '../../../../lib/identity-security-events';
import { sendIdentityEmail } from '../../../../lib/identity-email';
import {
  identityTestResponseEnabled,
  requestRateLimitSubject,
} from '../../../../lib/identity-route';
import { createPasswordReset } from '../../../../lib/password-reset';

const RESPONSE_MESSAGE =
  'Если учётная запись существует, инструкция по восстановлению будет отправлена.';

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  }
  let body: { email?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: RESPONSE_MESSAGE });
  }
  const email = typeof body.email === 'string' ? normalizeIdentityEmail(body.email) : '';
  if (!email || email.length > 320) {
    return NextResponse.json({ message: RESPONSE_MESSAGE });
  }
  try {
    const limiter = getIdentityRateLimiter();
    const [identifierAllowed, ipAllowed] = await Promise.all([
      limiter.consume({
        scope: 'password-reset-identifier',
        subject: email,
        limit: 5,
        windowSeconds: 60 * 60,
      }),
      limiter.consume({
        scope: 'password-reset-ip',
        subject: requestRateLimitSubject(request),
        limit: 20,
        windowSeconds: 60 * 60,
      }),
    ]);
    if (!identifierAllowed || !ipAllowed) return NextResponse.json({ message: RESPONSE_MESSAGE });
    const reset = await createPasswordReset(email);
    if (reset.deliverTo) {
      await sendIdentityEmail({
        kind: 'PASSWORD_RESET',
        recipient: reset.deliverTo,
        code: reset.token,
      });
    }
    await recordIdentitySecurityEvent({
      context: { userId: null, companyId: null, correlationId },
      action: 'identity.password.reset_requested',
      result: 'SUCCEEDED',
    });
    const response = NextResponse.json({
      message: RESPONSE_MESSAGE,
      resetToken: identityTestResponseEnabled() ? reset.token : undefined,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ message: RESPONSE_MESSAGE });
  }
}
