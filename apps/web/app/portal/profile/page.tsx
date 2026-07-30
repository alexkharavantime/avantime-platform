import { redirect } from 'next/navigation';

import {
  appendCompatibilitySearchParams,
  type CompatibilitySearchParams,
} from '../../../lib/compatibility-redirect';

export default async function PortalProfileCompatibility({
  searchParams,
}: {
  searchParams: Promise<CompatibilitySearchParams>;
}) {
  redirect(appendCompatibilitySearchParams('/portal/company', await searchParams));
}
