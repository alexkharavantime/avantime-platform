import { cookies } from 'next/headers';

import { defaultLocale, isLocale, localePath } from '../../../../../lib/i18n';
import { recordIdentitySecurityEvent } from '../../../../../lib/identity-security-events';
import { consumeOidcAuthorization, oidcCallbackUri } from '../../../../../lib/oidc';
import { completeOidcCallback, OIDC_MFA_COOKIE } from '../../../../../lib/oidc-flow';
import { safeReturnTo } from '../../../../../lib/safe-return-to';
import {
  createUserSession,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '../../../../../lib/session';
import { sitePublicRedirect } from '../../../../../lib/site-public-redirect';

function loginError(request: Request, code: string) {
  const localeHeader = request.headers.get('x-avantime-locale');
  const locale = isLocale(localeHeader) ? localeHeader : defaultLocale;
  const response = sitePublicRedirect(localePath(locale, `/portal/login?oidcError=${code}`));
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function GET(request: Request) {
  const localeHeader = request.headers.get('x-avantime-locale');
  const locale = isLocale(localeHeader) ? localeHeader : defaultLocale;
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
        redirectUri: oidcCallbackUri(),
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
      redirectUri: oidcCallbackUri(),
      currentSession,
      correlationId,
    });
    if (result.status === 'LINKED' || result.status === 'PROVIDER_VALIDATED') {
      return sitePublicRedirect(localePath(locale, result.returnTo));
    }
    if (result.status === 'MFA_REQUIRED') {
      const query = new URLSearchParams({ oidcMfa: '1' });
      if (result.enrollmentRequired) query.set('enrollmentRequired', '1');
      if (result.returnTo) query.set('returnTo', result.returnTo);
      const response = sitePublicRedirect(`${localePath(locale, '/portal/login')}?${query}`);
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
    const response = sitePublicRedirect(localePath(locale, target));
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
