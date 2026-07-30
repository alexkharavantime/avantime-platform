import { redirect } from 'next/navigation';
import {
  appendCompatibilitySearchParams,
  type CompatibilitySearchParams,
} from '../../../lib/compatibility-redirect';

export default async function DashboardAiCompatibility({
  searchParams,
}: {
  searchParams: Promise<CompatibilitySearchParams>;
}) {
  redirect(appendCompatibilitySearchParams('/portal/knowledge', await searchParams));
}
