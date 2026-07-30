import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { PortalShell } from '../../components/portal/portal-shell';
import { appendPortalAudit } from '../../lib/portal-audit';
import { getValidatedPortalSession } from '../../lib/portal-session';
import { safeReturnTo } from '../../lib/safe-return-to';

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const requestPath = safeReturnTo(requestHeaders.get('x-avantime-request-path') ?? undefined);
  const session = await getValidatedPortalSession();

  if (requestPath && !session) {
    redirect(`/portal/login?returnTo=${encodeURIComponent(requestPath)}`);
  }
  if (requestPath && session) {
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

  return <PortalShell session={session}>{children}</PortalShell>;
}
