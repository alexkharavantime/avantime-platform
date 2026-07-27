import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { getSession } from '../../../lib/session';

export default async function KnowledgeLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/portal/login?returnTo=/dashboard/knowledge');
  if (session.role !== 'ADMIN') redirect('/dashboard');
  return children;
}
