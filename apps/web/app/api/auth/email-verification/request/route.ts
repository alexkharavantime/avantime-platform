import { NextResponse } from 'next/server';

import { createEmailVerification } from '../../../../../lib/email-verification';
import { isSameOriginMutation, normalizeIdentityEmail } from '../../../../../lib/identity-auth';
import { getIdentityRateLimiter } from '../../../../../lib/identity-rate-limit';
import {
  identityTestResponseEnabled,
  requestRateLimitSubject,
} from '../../../../../lib/identity-route';
import { sendIdentityEmail } from '../../../../../lib/identity-email';
import { recordIdentitySecurityEvent } from '../../../../../lib/identity-security-events';
import { safeReturnTo } from '../../../../../lib/safe-return-to';

const RESPONSE_MESSAGE =
  'Если подтверждение требуется, инструкция будет отправлена на указанный адрес.';

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  }
  let body: { email?: unknown; returnTo?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: RESPONSE_MESSAGE });
  }
  const email = typeof body.email === 'string' ? normalizeIdentityEmail(body.email) : '';
  const returnTo = typeof body.returnTo === 'string' ? safeReturnTo(body.returnTo) : undefined;
  if (!email || email.length > 320) return NextResponse.json({ message: RESPONSE_MESSAGE });
  try {
    const limiter = getIdentityRateLimiter();
    const [identifierAllowed, ipAllowed] = await Promise.all([
      limiter.consume({
        scope: 'email-verification-identifier',
        subject: email,
        limit: 5,
        windowSeconds: 60 * 60,
      }),
      limiter.consume({
        scope: 'email-verification-ip',
        subject: requestRateLimitSubject(request),
        limit: 20,
        windowSeconds: 60 * 60,
      }),
    ]);
    if (!identifierAllowed || !ipAllowed) {
      return NextResponse.json({ message: RESPONSE_MESSAGE });
    }
    const verification = await createEmailVerification(email, returnTo);
    if (verification.deliverTo) {
      await sendIdentityEmail({
        kind: 'EMAIL_VERIFICATION',
        recipient: verification.deliverTo,
        code: verification.token,
      });
    }
    await recordIdentitySecurityEvent({
      context: { userId: null, companyId: null, correlationId },
      action: 'identity.email_verification.requested',
      result: 'SUCCEEDED',
    });
    const response = NextResponse.json({
      message: RESPONSE_MESSAGE,
      verificationToken: identityTestResponseEnabled() ? verification.token : undefined,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ message: RESPONSE_MESSAGE });
  }
}
