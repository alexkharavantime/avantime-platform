import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from './lib/session-constants';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicPortalPaths = ['/portal/login', '/portal/forgot-password', '/portal/reset-password'];
  const protectedApi = [
    '/api/account',
    '/api/attachments',
    '/api/documents',
    '/api/portal',
    '/api/requests',
    '/api/team',
  ].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  const protectedPage =
    path.startsWith('/dashboard') || path.startsWith('/portal') || path.startsWith('/admin');
  if ((!protectedPage && !protectedApi) || publicPortalPaths.includes(path)) {
    return NextResponse.next();
  }
  const correlationId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-avantime-request-path', `${path}${request.nextUrl.search}`);
  requestHeaders.set('x-avantime-correlation-id', correlationId);
  if (!request.cookies.get(SESSION_COOKIE)) {
    if (protectedApi) {
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      response.headers.set('x-correlation-id', correlationId);
      return response;
    }
    const loginUrl = new URL('/portal/login', request.url);
    loginUrl.searchParams.set('returnTo', `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

export const config = {
  matcher: [
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
