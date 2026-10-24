import { getPrisma } from '@avantime/database';

import { PlatformGovernancePage } from '../../../../components/portal/platform-governance-page';
import { AccessRequestsQueue } from '../../../../components/portal/access-requests-queue';
import { requirePlatformPagePermission } from '../../../../lib/platform-page';
import { listAccessRequestsForReview } from '../../../../lib/access-requests';
import { portalCopy } from '../../../../lib/i18n';
import { getLocale } from '../../../../lib/i18n-server';
import { isIdentityEmailDeliveryEnabled } from '../../../../lib/identity-email';

export default async function PlatformAccessRequestsPage() {
  await requirePlatformPagePermission('platform.access_requests.manage');
  const locale = await getLocale();
  const copy = portalCopy[locale].accessRequests;
  const prisma = await getPrisma();
  const [requests, companies] = await Promise.all([
    listAccessRequestsForReview(),
    prisma
      ? prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),
  ]);
  return (
    <PlatformGovernancePage
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      locale={locale}
    >
      <AccessRequestsQueue
        initialRequests={requests}
        companies={companies as Array<{ id: string; name: string }>}
        locale={locale}
        emailDeliveryEnabled={isIdentityEmailDeliveryEnabled()}
      />
    </PlatformGovernancePage>
  );
}
