import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  authenticateMfaChallenge,
  findLoginChallengeSecurityContext,
  isSameOriginMutation,
} from '../../../../../../lib/identity-auth';
import { getIdentityRateLimiter } from '../../../../../../lib/identity-rate-limit';
import { recordIdentitySecurityEvent } from '../../../../../../lib/identity-security-events';
import { OIDC_MFA_COOKIE } from '../../../../../../lib/oidc-flow';
import {
  createUserSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '../../../../../../lib/session';

function expireOidcChallenge(response: NextResponse) {
  response.cookies.set(OIDC_MFA_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  }
  const store = await cookies();
  const challengeToken = store.get(OIDC_MFA_COOKIE)?.value ?? '';
  let body: { code?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Неверный код подтверждения.' }, { status: 401 });
  }
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!challengeToken || !code) {
    return expireOidcChallenge(
      NextResponse.json({ error: 'Сеанс подтверждения истёк.' }, { status: 401 }),
    );
  }
  const correlationId = request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
  try {
    const allowed = await getIdentityRateLimiter().consume({
      scope: 'mfa-challenge',
      subject: challengeToken,
      limit: 5,
      windowSeconds: 5 * 60,
    });
    if (!allowed) {
      const securityContext = await findLoginChallengeSecurityContext(challengeToken);
      await recordIdentitySecurityEvent({
        context: { ...securityContext, correlationId },
        action: 'identity.login.suspicious_threshold',
        result: 'DENIED',
        metadata: { reasonCode: 'OIDC_MFA_RATE_LIMIT' },
        notify: Boolean(securityContext.userId && securityContext.companyId),
      });
      return expireOidcChallenge(
        NextResponse.json(
          { error: 'Слишком много попыток. Начните вход заново.' },
          { status: 429 },
        ),
      );
    }
  } catch {
    return NextResponse.json({ error: 'Вход временно недоступен.' }, { status: 503 });
  }

  const result = await authenticateMfaChallenge({ challengeToken, code });
  if (result.status === 'INVALID' || result.status === 'EXPIRED') {
    return NextResponse.json(
      {
        error:
          result.status === 'EXPIRED'
            ? 'Сеанс подтверждения истёк. Начните вход заново.'
            : 'Неверный код подтверждения.',
      },
      { status: 401 },
    );
  }
  if (result.status === 'UNAVAILABLE' || !result.identity.identityProviderId) {
    return expireOidcChallenge(
      NextResponse.json({ error: 'Вход временно недоступен.' }, { status: 503 }),
    );
  }
  try {
    const created = await createUserSession(result.identity, {
      userAgent: request.headers.get('user-agent'),
      previousToken: store.get(SESSION_COOKIE)?.value,
    });
    const response = NextResponse.json({
      ok: true,
      role: result.identity.role,
      returnTo: result.returnTo,
    });
    response.cookies.set(SESSION_COOKIE, created.token, sessionCookieOptions());
    await recordIdentitySecurityEvent({
      context: {
        userId: result.identity.userId,
        companyId: result.identity.companyId ?? null,
        correlationId,
      },
      action: result.recoveryCodeUsed ? 'identity.recovery_code.used' : 'identity.login.success',
      result: 'SUCCEEDED',
      metadata: {
        method: result.recoveryCodeUsed ? 'RECOVERY_CODE' : 'TOTP',
        providerId: result.identity.identityProviderId,
        sessionId: created.sessionId,
      },
      notify: true,
      target: {
        type: 'identity-provider',
        id: result.identity.identityProviderId,
      },
    });
    return expireOidcChallenge(response);
  } catch {
    return expireOidcChallenge(
      NextResponse.json({ error: 'Вход временно недоступен.' }, { status: 503 }),
    );
  }
}
