import { NextResponse } from 'next/server';

import { beginOidcAuthorization, OidcValidationError } from '../../../../../../lib/oidc';
import { safeReturnTo } from '../../../../../../lib/safe-return-to';
import { getSession } from '../../../../../../lib/session';

function callbackUri(request: Request) {
  const origin = process.env.AUTH_PUBLIC_ORIGIN?.trim() || new URL(request.url).origin;
  return new URL('/api/auth/oidc/callback', origin).toString();
}

export async function GET(request: Request, context: { params: Promise<{ providerKey: string }> }) {
  const { providerKey } = await context.params;
  const session = await getSession();
  const searchParams = new URL(request.url).searchParams;
  const returnTo = safeReturnTo(searchParams.get('returnTo') ?? undefined);
  const linkRequested = searchParams.get('mode') === 'link';
  const validationRequested = searchParams.get('mode') === 'validate';
  if (
    (linkRequested && !session) ||
    (validationRequested && (!session || session.role !== 'ADMIN' || !session.companyId))
  ) {
    return NextResponse.redirect(
      new URL('/portal/login?oidcError=link_session_required', request.url),
      303,
    );
  }
  try {
    const authorization = await beginOidcAuthorization({
      providerKey,
      redirectUri: callbackUri(request),
      userId: linkRequested || validationRequested ? session?.userId : undefined,
      companyId: linkRequested || validationRequested ? session?.companyId : undefined,
      purpose: validationRequested ? 'PROVIDER_VALIDATION' : linkRequested ? 'LINK' : 'LOGIN',
      returnTo,
    });
    const response = NextResponse.redirect(authorization.authorizationUrl, 303);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    const code =
      error instanceof OidcValidationError && error.code === 'PROVIDER_UNAVAILABLE'
        ? 'provider_unavailable'
        : 'authorization_unavailable';
    return NextResponse.redirect(new URL(`/portal/login?oidcError=${code}`, request.url), 303);
  }
}
