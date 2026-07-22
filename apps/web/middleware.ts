import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from './lib/session-constants';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const protectedArea = path.startsWith('/portal') || path.startsWith('/admin');
  if (!protectedArea || path === '/portal/login') return NextResponse.next();
  if (!request.cookies.get(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL('/portal/login', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/portal/:path*', '/admin/:path*'] };
