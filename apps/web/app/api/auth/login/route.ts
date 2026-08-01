import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  authenticatePrimaryCredential,
  findIdentitySecurityContextByIdentifier,
  isSameOriginMutation,
  normalizeIdentityEmail,
} from '../../../../lib/identity-auth';
import { getIdentityRateLimiter } from '../../../../lib/identity-rate-limit';
import {
  loginIdentifierRateLimitSubject,
  requestRateLimitSubject,
} from '../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../lib/identity-security-events';
import { safeReturnTo } from '../../../../lib/safe-return-to';
import { createUserSession, SESSION_COOKIE, sessionCookieOptions } from '../../../../lib/session';

const INVALID_CREDENTIALS = 'Неверный email или пароль.';

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Запрос входа отклонён.' }, { status: 403 });
  }

  let body: {
    email?: unknown;
    password?: unknown;
    returnTo?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }
  const email = typeof body.email === 'string' ? normalizeIdentityEmail(body.email) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const returnTo = typeof body.returnTo === 'string' ? safeReturnTo(body.returnTo) : undefined;
  if (!email || !password) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  try {
    const limiter = getIdentityRateLimiter();
    const [identifierAllowed, ipAllowed] = await Promise.all([
      limiter.consume({
        scope: 'login-identifier',
        subject: loginIdentifierRateLimitSubject(request, email),
        limit: 10,
        windowSeconds: 15 * 60,
      }),
      limiter.consume({
        scope: 'login-ip',
        subject: requestRateLimitSubject(request),
        limit: 50,
        windowSeconds: 15 * 60,
      }),
    ]);
    if (!identifierAllowed || !ipAllowed) {
      const securityContext = await findIdentitySecurityContextByIdentifier(email);
      await recordIdentitySecurityEvent({
        context: { ...securityContext, correlationId },
        action: 'identity.login.suspicious_threshold',
        result: 'DENIED',
        metadata: { reasonCode: 'BOUNDED_RATE_LIMIT' },
        notify: Boolean(securityContext.userId && securityContext.companyId),
      });
      return NextResponse.json(
        { error: 'Слишком много попыток. Повторите позже.' },
        { status: 429 },
      );
    }
  } catch {
    return NextResponse.json({ error: 'Вход временно недоступен.' }, { status: 503 });
  }

  const result = await authenticatePrimaryCredential({
    email,
    password,
    redirectTo: returnTo,
  });
  if (result.status === 'INVALID') {
    await recordIdentitySecurityEvent({
      context: { userId: null, companyId: null, correlationId },
      action: 'identity.login.failure',
      result: 'FAILED',
      metadata: { reasonCode: 'INVALID_LOGIN' },
    });
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }
  if (result.status === 'UNAVAILABLE') {
    return NextResponse.json({ error: 'Вход временно недоступен.' }, { status: 503 });
  }
  if (result.status === 'MFA_REQUIRED') {
    await recordIdentitySecurityEvent({
      context: {
        userId: result.userId,
        companyId: result.companyId,
        correlationId,
      },
      action: 'identity.login.mfa_required',
      result: 'SUCCEEDED',
      metadata: {
        method: 'TOTP',
        reasonCode: result.enrollmentRequired ? 'ENROLLMENT_REQUIRED' : 'CHALLENGE_REQUIRED',
      },
    });
    return NextResponse.json({
      mfaRequired: true,
      enrollmentRequired: result.enrollmentRequired,
      challengeToken: result.challengeToken,
    });
  }

  try {
    const cookieStore = await cookies();
    const created = await createUserSession(result.identity, {
      userAgent: request.headers.get('user-agent'),
      previousToken: cookieStore.get(SESSION_COOKIE)?.value,
    });
    const response = NextResponse.json({
      ok: true,
      role: result.identity.role,
      returnTo,
    });
    response.cookies.set(SESSION_COOKIE, created.token, sessionCookieOptions());
    await recordIdentitySecurityEvent({
      context: {
        userId: result.identity.userId,
        companyId: result.identity.companyId ?? null,
        correlationId,
      },
      action: 'identity.login.success',
      result: 'SUCCEEDED',
      metadata: { sessionId: created.sessionId },
      notify: true,
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Вход временно недоступен.' }, { status: 503 });
  }
}
