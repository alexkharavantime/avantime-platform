import { PortalNotificationCenter } from '../../../components/portal/notification-center';
import { redirect } from 'next/navigation';
import { getValidatedPortalSession } from '../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../lib/organization-permissions';
import { getLocale } from '../../../lib/i18n-server';
import { localePath, type Locale } from '../../../lib/i18n';

const copy: Record<Locale, { eyebrow: string; title: string; description: string }> = {
  lv: { eyebrow: 'Kabineta notikumi', title: 'Paziņojumi', description: 'Jūsu uzņēmuma pieprasījumi, ziņojumi un dokumenti. E-pasta iestatījumi ir pieejami sadaļā Iestatījumi.' },
  ru: { eyebrow: 'События кабинета', title: 'Уведомления', description: 'Обращения, сообщения и документы вашей компании. Настройки email находятся в настройках.' },
  en: { eyebrow: 'Portal activity', title: 'Notifications', description: 'Requests, messages and documents for your company. Email preferences are in Settings.' },
};

export default async function PortalNotificationsPage() {
  const locale = await getLocale();
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login?returnTo=/portal/notifications'));
  if (!hasOrganizationPermission(session, 'notifications.view')) redirect(localePath(locale, '/portal'));
  const text = copy[locale];
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6">
      <p className="eyebrow">{text.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">{text.title}</h1>
      <p className="mt-3 text-slate-600">{text.description}</p>
      <div className="mt-8">
        <PortalNotificationCenter locale={locale} />
      </div>
    </div>
  );
}
