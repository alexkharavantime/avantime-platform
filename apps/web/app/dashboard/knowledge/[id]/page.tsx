import { redirect } from 'next/navigation';

import {
  appendCompatibilitySearchParams,
  type CompatibilitySearchParams,
} from '../../../../lib/compatibility-redirect';
import { getValidatedPortalSession } from '../../../../lib/portal-session';

export default async function DashboardDocumentCompatibility({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<CompatibilitySearchParams>;
}) {
  const [{ id }, query, session] = await Promise.all([
    params,
    searchParams,
    getValidatedPortalSession(),
  ]);
  const base =
    session?.role === 'ADMIN'
      ? `/admin/documents/${encodeURIComponent(id)}`
      : `/portal/documents/${encodeURIComponent(id)}`;
  redirect(appendCompatibilitySearchParams(base, query));
}
