import { PlatformGovernancePage } from '../../../../components/portal/platform-governance-page';
import { requirePlatformPagePermission } from '../../../../lib/platform-page';

export default async function PlatformOperationsPage() {
  await requirePlatformPagePermission('platform.operations.manage');
  return (
    <PlatformGovernancePage
      eyebrow="Platform governance"
      title="Операционные действия"
      description="Очереди, document processing и health controls используют platform operator permissions, а не organization ADMIN."
    />
  );
}
