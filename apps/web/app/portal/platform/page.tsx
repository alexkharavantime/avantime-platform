import { PlatformGovernancePage } from '../../../components/portal/platform-governance-page';
import { platformGovernanceCopy } from '../../../components/portal/platform-governance-page';
import { requirePlatformPagePermission } from '../../../lib/platform-page';
import { getLocale } from '../../../lib/i18n-server';

export default async function PlatformPage() {
  await requirePlatformPagePermission('platform.view');
  const locale = await getLocale();
  const text = platformGovernanceCopy[locale].overview;
  return (
    <PlatformGovernancePage
      {...text}
      locale={locale}
    />
  );
}
