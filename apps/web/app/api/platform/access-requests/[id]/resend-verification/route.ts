import { NextResponse } from 'next/server';

import {
  AccessRequestError,
  buildAccessRequestVerificationUrl,
  rotateAccessRequestVerification,
} from '../../../../../../lib/access-requests';
import { governanceMutationOriginAllowed } from '../../../../../../lib/governance-request-security';
import { isIdentityEmailDeliveryEnabled, sendIdentityEmail } from '../../../../../../lib/identity-email';
import { recordIdentitySecurityEvent } from '../../../../../../lib/identity-security-events';
import { getIdentityRateLimiter } from '../../../../../../lib/identity-rate-limit';
import { requestRateLimitSubject } from '../../../../../../lib/identity-route';
import { isLocale } from '../../../../../../lib/i18n';
import { authorizePlatformApi } from '../../../../../../lib/platform-authorization';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!governanceMutationOriginAllowed(request)) {
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  }
  const { id } = await params;
  const authorization = await authorizePlatformApi('platform.access_requests.manage', {
    operationalContext: { targetType: 'access-request', targetId: id },
  });
  if (authorization.response) return authorization.response;

  const correlationId = request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
  try {
    const limiter = getIdentityRateLimiter();
    const [requestAllowed, ipAllowed] = await Promise.all([
      limiter.consume({
        scope: 'access-request-resend-request',
        subject: id,
        limit: 5,
        windowSeconds: 60 * 60,
      }),
      limiter.consume({
        scope: 'access-request-resend-ip',
        subject: requestRateLimitSubject(request),
        limit: 20,
        windowSeconds: 60 * 60,
      }),
    ]);
    if (!requestAllowed || !ipAllowed) {
      return NextResponse.json(
        { error: 'Слишком много попыток. Повторите позже.', deliveryStatus: 'rate_limited' },
        { status: 429 },
      );
    }

    const verification = await rotateAccessRequestVerification(id);
    const locale = isLocale(verification.locale) ? verification.locale : undefined;
    let deliveryStatus: 'accepted' | 'disabled' | 'failed' = 'disabled';
    if (isIdentityEmailDeliveryEnabled()) {
      try {
        const delivery = await sendIdentityEmail({
          kind: 'ACCESS_REQUEST_VERIFICATION',
          recipient: verification.email,
          code: buildAccessRequestVerificationUrl(verification.token, locale, request.url),
          locale,
        });
        deliveryStatus = delivery.accepted ? 'accepted' : 'disabled';
      } catch {
        deliveryStatus = 'failed';
        console.warn('Access request confirmation email failed to send.');
      }
    }

    await recordIdentitySecurityEvent({
      context: { userId: authorization.session.userId, companyId: null, correlationId },
      action: 'identity.access_request.verification_resent',
      result: deliveryStatus === 'accepted' ? 'SUCCEEDED' : 'FAILED',
    });
    const response = NextResponse.json({ deliveryStatus });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof AccessRequestError && error.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Заявка не найдена.' }, { status: 404 });
    }
    if (error instanceof AccessRequestError && error.code === 'INVALID_STATE') {
      return NextResponse.json(
        { error: 'Подтверждение доступно только для ожидающей заявки.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Не удалось повторно отправить подтверждение.' }, { status: 503 });
  }
}