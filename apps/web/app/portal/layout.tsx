import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { PortalShell } from '../../components/portal/portal-shell';
import { appendPortalAudit } from '../../lib/portal-audit';
import { getValidatedPortalSession } from '../../lib/portal-session';
import { safeReturnTo } from '../../lib/safe-return-to';
import { buildPortalNavigation } from '../../lib/portal-navigation';
import { stripLocale } from '../../lib/i18n';
import { getLocale } from '../../lib/i18n-server';
import { isPortalPublicPath } from '../../lib/portal-public-paths';

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const currentPath = requestHeaders.get('x-avantime-request-path') ?? undefined;
  const currentPathname = currentPath?.split('?')[0].split('#')[0];
  const isPublicPortalPath = currentPathname
    ? isPortalPublicPath(stripLocale(currentPathname))
    : false;
  const locale = await getLocale();
  const session = await getValidatedPortalSession();

  if (!session && !isPublicPortalPath) {
    const returnTo = safeReturnTo(currentPath);
    redirect(returnTo ? `/portal/login?returnTo=${encodeURIComponent(returnTo)}` : '/portal/login');
  }
  if (session && currentPath) {
    await appendPortalAudit(
      session,
      {
        action: 'portal.access',
        targetType: 'portal',
        targetId: null,
        result: 'SUCCEEDED',
      },
      requestHeaders.get('x-avantime-correlation-id') ?? crypto.randomUUID(),
    );
  }

  return (
    <PortalShell
      session={session}
      navigation={buildPortalNavigation(session, locale)}
      locale={locale}
      isPublicPath={isPublicPortalPath}
    >
      {children}
    </PortalShell>
  );
}
