import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getValidatedPortalSession } from '../../lib/portal-session';
import { safeReturnTo } from '../../lib/safe-return-to';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getValidatedPortalSession();
  if (!session) {
    const requestPath =
      safeReturnTo((await headers()).get('x-avantime-request-path') ?? undefined) ?? '/dashboard';
    redirect(`/portal/login?returnTo=${encodeURIComponent(requestPath)}`);
  }
  return children;
}
