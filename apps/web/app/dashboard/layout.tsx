import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { PlatformSidebar } from '../../components/platform-sidebar';
import { PlatformTopbar } from '../../components/platform-topbar';
import { getSession } from '../../lib/session';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (!(await getSession())) redirect('/portal/login?returnTo=/dashboard');
  return <div className="min-h-screen bg-slate-50 lg:flex"><div className="hidden lg:block"><PlatformSidebar /></div><div className="min-w-0 flex-1"><PlatformTopbar />{children}</div></div>;
}
