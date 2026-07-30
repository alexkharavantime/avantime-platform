import { redirect } from 'next/navigation';
import {
  appendCompatibilitySearchParams,
  type CompatibilitySearchParams,
} from '../../../lib/compatibility-redirect';

export default async function DashboardProjectsCompatibility({
  searchParams,
}: {
  searchParams: Promise<CompatibilitySearchParams>;
}) {
  redirect(appendCompatibilitySearchParams('/portal/requests', await searchParams));
}
