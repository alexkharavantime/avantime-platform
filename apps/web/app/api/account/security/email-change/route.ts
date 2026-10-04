import { NextResponse } from 'next/server';

import { createEmailChangeVerification, EmailChangeError } from '../../../../../lib/email-change';
import { identityPublicUrl } from '../../../../../lib/identity-public-url';
import { normalizeIdentityEmail } from '../../../../../lib/identity-auth';
import {
  identityCorrelationId,
  identityTestResponseEnabled,
  parseIdentityMutation,
  requestRateLimitSubject,
} from '../../../../../lib/identity-route';
import { getIdentityRateLimiter } from '../../../../../lib/identity-rate-limit';
import { defaultLocale, isLocale, localePath } from '../../../../../lib/i18n';
import { sendIdentityEmail } from '../../../../../lib/identity-email';
import { recordIdentitySecurityEvent } from '../../../../../lib/identity-security-events';
import { authorizePortalApi } from '../../../../../lib/portal-session';

const RECENT_AUTH_WINDOW_MS = 10 * 60_000;

export async function POST(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const email = typeof parsed.body.email === 'string' ? normalizeIdentityEmail(parsed.body.email) : '';
  const locale =
    typeof parsed.body.locale === 'string' && isLocale(parsed.body.locale)
      ? parsed.body.locale
      : defaultLocale;
  if (!email || email.length > 320) {
    return NextResponse.json({ error: 'Укажите корректный email.' }, { status: 400 });
  }
  const authenticationAt = authorization.session.authenticationAt ?? 0;
  if (
    authenticationAt > Date.now() ||
    Date.now() - authenticationAt > RECENT_AUTH_WINDOW_MS
  ) {
    return NextResponse.json(
      { error: 'Для изменения email войдите в систему повторно.' },
      { status: 403 },
    );
  }
  const correlationId = identityCorrelationId(request);
  try {
    const limiter = getIdentityRateLimiter();
    const [userAllowed, ipAllowed] = await Promise.all([
      limiter.consume({
        scope: 'email-change-user',
        subject: authorization.session.userId,
        limit: 3,
        windowSeconds: 60 * 60,
      }),
      limiter.consume({
        scope: 'email-change-ip',
        subject: requestRateLimitSubject(request),
        limit: 10,
        windowSeconds: 60 * 60,
      }),
    ]);
    if (!userAllowed || !ipAllowed) {
      return NextResponse.json({ error: 'Слишком много запросов. Повторите позже.' }, { status: 429 });
    }
    const verification = await createEmailChangeVerification(authorization.session.userId, email);
    const verificationUrl = identityPublicUrl(
      localePath(locale, '/portal/settings/security/confirm-email-change'),
      request.url,
    );
    verificationUrl.searchParams.set('token', verification.token);
    const delivery = await sendIdentityEmail({
      kind: 'EMAIL_CHANGE_VERIFICATION',
      recipient: verification.email,
      code: verificationUrl.toString(),
      locale,
    });
    await recordIdentitySecurityEvent({
      context: {
        userId: authorization.session.userId,
        companyId: authorization.session.companyId ?? null,
        correlationId,
      },
      action: 'identity.email.change_requested',
      result: delivery.accepted ? 'SUCCEEDED' : 'FAILED',
    });
    return NextResponse.json({
      success: true,
      emailAccepted: delivery.accepted,
      emailDeliveryConfirmed: delivery.deliveryConfirmed,
      verificationToken: identityTestResponseEnabled() ? verification.token : undefined,
    });
  } catch (error) {
    if (error instanceof EmailChangeError) {
      if (error.code === 'EMAIL_ALREADY_IN_USE') {
        return NextResponse.json({ error: 'Этот email уже используется.' }, { status: 409 });
      }
      if (error.code === 'ALREADY_CURRENT') {
        return NextResponse.json({ error: 'Этот email уже используется для входа.' }, { status: 400 });
      }
      if (error.code === 'INVALID_EMAIL') {
        return NextResponse.json({ error: 'Укажите корректный email.' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Изменение email временно недоступно.' }, { status: 503 });
    }
    console.warn('Email change verification email failed to send.');
    return NextResponse.json(
      { error: 'Письмо не отправлено. Проверьте почтовую конфигурацию и повторите запрос.' },
      { status: 503 },
    );
  }
}