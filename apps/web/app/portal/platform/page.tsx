import { PlatformGovernancePage } from '../../../components/portal/platform-governance-page';
import { requirePlatformPagePermission } from '../../../lib/platform-page';

export default async function PlatformPage() {
  await requirePlatformPagePermission('platform.view');
  return (
    <PlatformGovernancePage
      eyebrow="Platform governance"
      title="Управление платформой"
      description="Глобальные роли, аудит, support-сессии и operational controls отделены от прав конкретной организации."
    />
  );
}
