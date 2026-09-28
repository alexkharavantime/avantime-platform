import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, stripLocale } from './lib/i18n';
import { SESSION_COOKIE } from './lib/session-constants';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const localeSegment = path.split('/')[1];
  const locale = isLocale(localeSegment) ? localeSegment : null;
  const routePath = locale ? stripLocale(path) : path;
  const publicPortalPaths = ['/portal/login', '/portal/forgot-password', '/portal/reset-password'];
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
  if (locale) requestHeaders.set('x-avantime-locale', locale);
  const continueRequest = () => {
    if (!locale) return NextResponse.next({ request: { headers: requestHeaders } });
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = routePath;
    return NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
  };
  if ((!protectedPage && !protectedApi) || publicPortalPaths.includes(routePath)) {
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
    const loginUrl = new URL(locale ? `/${locale}/portal/login` : '/portal/login', request.url);
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
