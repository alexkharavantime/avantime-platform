import { NextResponse } from 'next/server';

import { defaultLocale, isLocale, localePath } from '../../../../../../lib/i18n';
import {
  beginOidcAuthorization,
  oidcCallbackUri,
  OidcValidationError,
} from '../../../../../../lib/oidc';
import { safeReturnTo } from '../../../../../../lib/safe-return-to';
import { getSession } from '../../../../../../lib/session';
import { sitePublicRedirect } from '../../../../../../lib/site-public-redirect';
import { hasOrganizationPermission } from '../../../../../../lib/organization-permissions';

export async function GET(request: Request, context: { params: Promise<{ providerKey: string }> }) {
  const localeHeader = request.headers.get('x-avantime-locale');
  const locale = isLocale(localeHeader) ? localeHeader : defaultLocale;
  const { providerKey } = await context.params;
  const session = await getSession();
  const searchParams = new URL(request.url).searchParams;
  const returnTo = safeReturnTo(searchParams.get('returnTo') ?? undefined);
  const linkRequested = searchParams.get('mode') === 'link';
  const validationRequested = searchParams.get('mode') === 'validate';
  if (
    (linkRequested && !session) ||
    (validationRequested && !hasOrganizationPermission(session, 'identity.providers.manage'))
  ) {
    return sitePublicRedirect(localePath(locale, '/portal/login?oidcError=link_session_required'));
  }
  try {
    const authorization = await beginOidcAuthorization({
      providerKey,
      redirectUri: oidcCallbackUri(),
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
    return sitePublicRedirect(localePath(locale, `/portal/login?oidcError=${code}`));
  }
}
