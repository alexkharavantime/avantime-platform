import { PortalNotificationCenter } from '../../../components/portal/notification-center';
import { redirect } from 'next/navigation';
import { getValidatedPortalSession } from '../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../lib/organization-permissions';

export default async function PortalNotificationsPage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/portal/notifications');
  if (!hasOrganizationPermission(session, 'notifications.view')) redirect('/portal');
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6">
      <p className="eyebrow">События кабинета</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">Уведомления</h1>
      <p className="mt-3 text-slate-600">
        Обращения, сообщения и документы вашей компании. Настройки email находятся в настройках.
      </p>
      <div className="mt-8">
        <PortalNotificationCenter />
      </div>
    </div>
  );
}
