import { NextResponse, type NextRequest } from 'next/server';
import {
  isLocale,
  localeCookieMaxAge,
  localeCookieName,
  resolveLocale,
  stripLocale,
} from './lib/i18n';
import { isPortalPublicPath } from './lib/portal-public-paths';
import { SESSION_COOKIE } from './lib/session-constants';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const localeSegment = path.split('/')[1];
  const pathLocale = isLocale(localeSegment) ? localeSegment : null;
  const previousPath = request.headers.get('x-avantime-original-path')?.split(/[?#]/u, 1)[0];
  const previousPathLocale = previousPath?.split('/')[1];
  const rewrittenLocale =
    !pathLocale &&
    previousPath &&
    stripLocale(previousPath) === path &&
    isLocale(previousPathLocale)
      ? previousPathLocale
      : null;
  const locale =
    rewrittenLocale ??
    resolveLocale(
      path,
      request.cookies.get(localeCookieName)?.value,
      request.headers.get('accept-language'),
    );
  const routePath = pathLocale ? stripLocale(path) : path;
  const protectedApi = [
    '/api/account',
    '/api/attachments',
    '/api/documents',
    '/api/portal',
    '/api/requests',
    '/api/team',
  ].some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`));
  const protectedPage =
    routePath.startsWith('/dashboard') || routePath.startsWith('/portal') || routePath.startsWith('/admin');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-avantime-request-path', `${path}${request.nextUrl.search}`);
  requestHeaders.set('x-avantime-original-path', `${path}${request.nextUrl.search}`);
  requestHeaders.set('x-avantime-locale', locale);
  const continueRequest = () => {
    let response: NextResponse;
    if (pathLocale) {
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = routePath;
      response = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
    } else {
      response = NextResponse.next({ request: { headers: requestHeaders } });
    }
    if (pathLocale && request.cookies.get(localeCookieName)?.value !== locale) {
      response.cookies.set(localeCookieName, locale, {
        httpOnly: true,
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: localeCookieMaxAge,
      });
    }
    return response;
  };
  if ((!protectedPage && !protectedApi) || isPortalPublicPath(routePath)) {
    return continueRequest();
  }
  const correlationId = crypto.randomUUID();
  requestHeaders.set('x-avantime-correlation-id', correlationId);
  if (!request.cookies.get(SESSION_COOKIE)) {
    if (protectedApi) {
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      response.headers.set('x-correlation-id', correlationId);
      return response;
    }
    let redirectBase = request.url;
    const configuredOrigin = process.env.AUTH_PUBLIC_ORIGIN?.trim();
    if (configuredOrigin) {
      try {
        const parsedOrigin = new URL(configuredOrigin);
        if (parsedOrigin.origin === configuredOrigin) redirectBase = parsedOrigin.origin;
      } catch {
        redirectBase = request.url;
      }
    }
    const loginUrl = new URL(locale ? `/${locale}/portal/login` : '/portal/login', redirectBase);
    loginUrl.searchParams.set('returnTo', `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  const response = continueRequest();
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
    '/dashboard/:path*',
    '/portal/:path*',
    '/admin/:path*',
    '/api/account/:path*',
    '/api/attachments/:path*',
    '/api/documents/:path*',
    '/api/portal/:path*',
    '/api/requests/:path*',
    '/api/team/:path*',
  ],
};
