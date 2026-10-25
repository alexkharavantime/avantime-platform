import { NextResponse } from 'next/server';

import { AccessRequestError, verifyAccessRequestEmail } from '../../../../../lib/access-requests';
import { sendIdentityEmail } from '../../../../../lib/identity-email';
import { isSameOriginMutation } from '../../../../../lib/identity-auth';
import { getIdentityRateLimiter } from '../../../../../lib/identity-rate-limit';
import { requestRateLimitSubject } from '../../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../../lib/identity-security-events';
import { defaultLocale, isLocale, localePath } from '../../../../../lib/i18n';
import { identityPublicUrl } from '../../../../../lib/identity-public-url';

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  }
  let body: { token?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Ссылка недействительна или истекла.' }, { status: 400 });
  }
  const token = typeof body.token === 'string' ? body.token : '';
  try {
    const allowed = await getIdentityRateLimiter().consume({
      scope: 'access-request-verify-ip',
      subject: requestRateLimitSubject(request),
      limit: 30,
      windowSeconds: 60 * 60,
    });
    if (!allowed) {
      return NextResponse.json({ error: 'Слишком много попыток. Повторите позже.' }, { status: 429 });
    }
    const verified = await verifyAccessRequestEmail(token);
    const recipient = process.env.ACCESS_REQUEST_NOTIFICATION_EMAIL?.trim();
    if (recipient) {
      try {
        const locale = isLocale(verified?.locale) ? verified.locale : defaultLocale;
        const reviewUrl = identityPublicUrl(
          localePath(locale, '/portal/platform/access-requests'),
          request.url,
        );
        await sendIdentityEmail({
          kind: 'ACCESS_REQUEST_REVIEW_NOTIFICATION',
          recipient,
          code: reviewUrl.toString(),
          locale,
        });
      } catch {
        console.warn('Access request administrator notification failed to send.');
      }
    }
    await recordIdentitySecurityEvent({
      context: { userId: null, companyId: null, correlationId },
      action: 'identity.access_request.email_verified',
      result: 'SUCCEEDED',
    });
    return NextResponse.json({ verified: true });
  } catch (error) {
    if (error instanceof AccessRequestError && error.code === 'DATABASE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Подтверждение временно недоступно.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Ссылка недействительна или истекла.' }, { status: 400 });
  }
}
