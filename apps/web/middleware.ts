import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from './lib/session-constants';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicPortalPaths = ['/portal/login', '/portal/forgot-password', '/portal/reset-password'];
  const protectedArea =
    path.startsWith('/dashboard') || path.startsWith('/portal') || path.startsWith('/admin');
  if (!protectedArea || publicPortalPaths.includes(path)) return NextResponse.next();
  if (!request.cookies.get(SESSION_COOKIE)) {
    const loginUrl = new URL('/portal/login', request.url);
    loginUrl.searchParams.set('returnTo', `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*', '/portal/:path*', '/admin/:path*'] };
