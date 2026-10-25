import { redirect } from 'next/navigation';
import Link from 'next/link';

import { NotificationSettingsForm } from '../../../components/portal/notification-settings-form';
import { getNotificationPreferences } from '../../../lib/notification-preferences';
import { getValidatedPortalSession } from '../../../lib/portal-session';
import { getLocale } from '../../../lib/i18n-server';
import { localePath, type Locale } from '../../../lib/i18n';

const copy: Record<Locale, { eyebrow: string; title: string; description: string; security: string; securityDescription: string; openSecurity: string; session: string; logout: string }> = {
  lv: { eyebrow: 'Iestatījumi', title: 'Kabineta iestatījumi', description: 'Pārvaldiet e-pasta paziņojumus un pašreizējo sesiju.', security: 'Konta drošība', securityDescription: 'MFA, atkopšanas kodi, parole un aktīvās sesijas ir pieejamas atsevišķā lapā.', openSecurity: 'Atvērt drošības iestatījumus', session: 'Pašreizējā sesija', logout: 'Iziet no kabineta' },
  ru: { eyebrow: 'Настройки', title: 'Настройки кабинета', description: 'Управляйте email-уведомлениями и текущей сессией.', security: 'Безопасность учётной записи', securityDescription: 'MFA, резервные коды, пароль и активные сессии доступны на отдельной странице.', openSecurity: 'Открыть настройки безопасности', session: 'Текущая сессия', logout: 'Выйти из кабинета' },
  en: { eyebrow: 'Settings', title: 'Portal settings', description: 'Manage email notifications and your current session.', security: 'Account security', securityDescription: 'MFA, recovery codes, password and active sessions are available on a separate page.', openSecurity: 'Open security settings', session: 'Current session', logout: 'Sign out of portal' },
};

export default async function PortalSettingsPage() {
  const locale = await getLocale();
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login?returnTo=/portal/settings'));
  const preferences = await getNotificationPreferences(session.userId);
  const text = copy[locale];
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-6">
      <p className="eyebrow">{text.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">{text.title}</h1>
      <p className="mt-3 text-slate-600">{text.description}</p>
      <NotificationSettingsForm initial={preferences} locale={locale} />
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-black">{text.security}</h2>
        <p className="mt-2 text-sm text-slate-600">{text.securityDescription}</p>
        <Link
          href={localePath(locale, '/portal/settings/security')}
          className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 font-bold text-white"
        >
          {text.openSecurity}
        </Link>
      </section>
      <form
        action={localePath(locale, '/api/auth/logout')}
        method="post"
        className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"
      >
        <h2 className="text-xl font-black">{text.session}</h2>
        <p className="mt-2 text-sm text-slate-600">{session.email}</p>
        <button className="mt-5 rounded-xl border border-red-200 px-5 py-3 font-bold text-red-700">
          {text.logout}
        </button>
      </form>
    </div>
  );
}
