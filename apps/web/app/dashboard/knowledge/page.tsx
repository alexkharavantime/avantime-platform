import { redirect } from 'next/navigation';

import {
  appendCompatibilitySearchParams,
  type CompatibilitySearchParams,
} from '../../../lib/compatibility-redirect';
import { getValidatedPortalSession } from '../../../lib/portal-session';

export default async function DashboardKnowledgeCompatibility({
  searchParams,
}: {
  searchParams: Promise<CompatibilitySearchParams>;
}) {
  const session = await getValidatedPortalSession();
  const target = session?.role === 'ADMIN' ? '/admin/documents' : '/portal/knowledge';
  redirect(appendCompatibilitySearchParams(target, await searchParams));
}
