import { redirect } from 'next/navigation';

import { sessionHasPlatformPermission, type PlatformPermission } from './platform-permissions';
import { getSession } from './session';

export async function requirePlatformPagePermission(permission: PlatformPermission) {
  const session = await getSession();
  if (!session) redirect(`/portal/login?returnTo=${encodeURIComponent('/portal/platform')}`);
  if (!sessionHasPlatformPermission(session, permission)) redirect('/portal');
  return session;
}
