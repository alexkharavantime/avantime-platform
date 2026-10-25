import { NextResponse } from 'next/server';

import {
  buildAccessRequestVerificationUrl,
  createAccessRequest,
} from '../../../../lib/access-requests';
import { isSameOriginMutation, normalizeIdentityEmail } from '../../../../lib/identity-auth';
import { isIdentityEmailDeliveryEnabled, sendIdentityEmail } from '../../../../lib/identity-email';
import { getIdentityRateLimiter } from '../../../../lib/identity-rate-limit';
import { requestRateLimitSubject } from '../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../lib/identity-security-events';
import { isLocale } from '../../../../lib/i18n';

// Always the same generic response: never confirm or deny whether an email was accepted,
// queued, or already known, and never leak the underlying failure reason.
const RESPONSE_MESSAGE =
  'Если данные корректны, письмо с подтверждением будет отправлено на указанный адрес.';

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  }
  let body: { name?: unknown; email?: unknown; companyName?: unknown; comment?: unknown; locale?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: RESPONSE_MESSAGE });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? normalizeIdentityEmail(body.email) : '';
  const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
  const comment = typeof body.comment === 'string' ? body.comment : undefined;
  const localeCandidate = typeof body.locale === 'string' ? body.locale : undefined;
  const locale = isLocale(localeCandidate) ? localeCandidate : undefined;
  if (
    name.length < 2 ||
    name.length > 200 ||
    !email ||
    email.length > 320 ||
    companyName.length < 2 ||
    companyName.length > 200
  ) {
    return NextResponse.json({ message: RESPONSE_MESSAGE });
  }
  try {
    const limiter = getIdentityRateLimiter();
    const [identifierAllowed, ipAllowed] = await Promise.all([
      limiter.consume({
        scope: 'access-request-identifier',
        subject: email,
        limit: 3,
        windowSeconds: 60 * 60,
      }),
      limiter.consume({
        scope: 'access-request-ip',
        subject: requestRateLimitSubject(request),
        limit: 20,
        windowSeconds: 60 * 60,
      }),
    ]);
    if (!identifierAllowed || !ipAllowed) {
      return NextResponse.json({ message: RESPONSE_MESSAGE });
    }
    // Saving the request and delivering the confirmation email are independent steps: a mail
    // provider outage must never be reported back to an anonymous caller, and it never erases
    // the request that was already persisted.
    const { token } = await createAccessRequest({ name, email, companyName, comment, locale });
    let deliveryStatus: 'accepted' | 'disabled' | 'failed' = 'disabled';
    if (isIdentityEmailDeliveryEnabled()) {
      try {
        const delivery = await sendIdentityEmail({
          kind: 'ACCESS_REQUEST_VERIFICATION',
          recipient: email,
          code: buildAccessRequestVerificationUrl(token, locale, request.url),
          locale,
        });
        deliveryStatus = delivery.accepted ? 'accepted' : 'disabled';
      } catch {
        deliveryStatus = 'failed';
        console.warn('Access request confirmation email failed to send.');
      }
    }
    await recordIdentitySecurityEvent({
      context: { userId: null, companyId: null, correlationId },
      action: 'identity.access_request.submitted',
      result: 'SUCCEEDED',
    });
    const response = NextResponse.json({ message: RESPONSE_MESSAGE, deliveryStatus });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ message: RESPONSE_MESSAGE });
  }
}
