import { redirect } from 'next/navigation';
import {
  appendCompatibilitySearchParams,
  type CompatibilitySearchParams,
} from '../../../lib/compatibility-redirect';

export default async function DashboardDocumentsCompatibility({
  searchParams,
}: {
  searchParams: Promise<CompatibilitySearchParams>;
}) {
  redirect(appendCompatibilitySearchParams('/portal/documents', await searchParams));
}
