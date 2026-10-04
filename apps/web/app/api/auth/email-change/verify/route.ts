import { NextResponse } from 'next/server';

import { confirmEmailChange, EmailChangeError } from '../../../../../lib/email-change';
import { identityCorrelationId, parseIdentityMutation, requestRateLimitSubject } from '../../../../../lib/identity-route';
import { getIdentityRateLimiter } from '../../../../../lib/identity-rate-limit';
import { recordIdentitySecurityEvent } from '../../../../../lib/identity-security-events';

export async function POST(request: Request) {
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const token = typeof parsed.body.token === 'string' ? parsed.body.token : '';
  try {
    const allowed = await getIdentityRateLimiter().consume({
      scope: 'email-change-verify-ip',
      subject: requestRateLimitSubject(request),
      limit: 20,
      windowSeconds: 60 * 60,
    });
    if (!allowed) {
      return NextResponse.json({ error: 'Слишком много попыток. Повторите позже.' }, { status: 429 });
    }
    const result = await confirmEmailChange(token);
    await recordIdentitySecurityEvent({
      context: { userId: result.userId, companyId: null, correlationId: identityCorrelationId(request) },
      action: 'identity.email.changed',
      result: 'SUCCEEDED',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof EmailChangeError && error.code === 'DATABASE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Подтверждение временно недоступно.' }, { status: 503 });
    }
    const databaseCode =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined;
    const reason =
      error instanceof EmailChangeError
        ? error.code
        : `${error instanceof Error ? error.name : 'UNKNOWN'}${databaseCode ? `:${databaseCode}` : ''}`;
    console.warn('Email change confirmation rejected.', reason);
    return NextResponse.json({ error: 'Ссылка недействительна или истекла.' }, { status: 400 });
  }
}