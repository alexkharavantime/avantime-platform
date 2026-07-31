import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { recordIdentitySecurityEvent } from '../../../../../lib/identity-security-events';
import { consumeOidcAuthorization } from '../../../../../lib/oidc';
import { completeOidcCallback, OIDC_MFA_COOKIE } from '../../../../../lib/oidc-flow';
import { safeReturnTo } from '../../../../../lib/safe-return-to';
import {
  createUserSession,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '../../../../../lib/session';

function callbackUri(request: Request) {
  const origin = process.env.AUTH_PUBLIC_ORIGIN?.trim() || new URL(request.url).origin;
  return new URL('/api/auth/oidc/callback', origin).toString();
}

function loginError(request: Request, code: string) {
  const response = NextResponse.redirect(
    new URL(`/portal/login?oidcError=${code}`, request.url),
    303,
  );
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  const providerError = url.searchParams.get('error');
  const correlationId = request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
  if (!state || state.length > 1_000) return loginError(request, 'callback_rejected');

  if (providerError) {
    try {
      await consumeOidcAuthorization({
        state,
        redirectUri: callbackUri(request),
      });
    } catch {
      // The public response remains generic for invalid and already consumed state.
    }
    return loginError(request, 'provider_rejected');
  }
  if (!code) return loginError(request, 'callback_rejected');

  try {
    const currentSession = await getSession();
    const result = await completeOidcCallback({
      state,
      code,
      redirectUri: callbackUri(request),
      currentSession,
      correlationId,
    });
    if (result.status === 'LINKED' || result.status === 'PROVIDER_VALIDATED') {
      return NextResponse.redirect(new URL(result.returnTo, request.url), 303);
    }
    if (result.status === 'MFA_REQUIRED') {
      const target = new URL('/portal/login', request.url);
      target.searchParams.set('oidcMfa', '1');
      if (result.enrollmentRequired) target.searchParams.set('enrollmentRequired', '1');
      if (result.returnTo) target.searchParams.set('returnTo', result.returnTo);
      const response = NextResponse.redirect(target, 303);
      response.cookies.set(OIDC_MFA_COOKIE, result.challengeToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 5 * 60,
      });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }
    const store = await cookies();
    const created = await createUserSession(result.identity, {
      userAgent: request.headers.get('user-agent'),
      previousToken: store.get(SESSION_COOKIE)?.value,
    });
    const target =
      safeReturnTo(result.returnTo) ?? (result.identity.role === 'ADMIN' ? '/admin' : '/portal');
    const response = NextResponse.redirect(new URL(target, request.url), 303);
    response.cookies.set(SESSION_COOKIE, created.token, sessionCookieOptions());
    response.headers.set('Cache-Control', 'no-store');
    await recordIdentitySecurityEvent({
      context: {
        userId: result.identity.userId,
        companyId: result.identity.companyId ?? null,
        correlationId,
      },
      action: 'identity.login.success',
      result: 'SUCCEEDED',
      metadata: {
        providerId: result.providerId,
        sessionId: created.sessionId,
        reasonCode: 'OIDC',
      },
      notify: true,
      target: { type: 'identity-provider', id: result.providerId },
    });
    return response;
  } catch {
    return loginError(request, 'callback_rejected');
  }
}
