import { redirect } from 'next/navigation';

import { NotificationSettingsForm } from '../../../components/portal/notification-settings-form';
import { getNotificationPreferences } from '../../../lib/notification-preferences';
import { getValidatedPortalSession } from '../../../lib/portal-session';

export default async function PortalSettingsPage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/portal/settings');
  const preferences = await getNotificationPreferences(session.userId);
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-6">
      <p className="eyebrow">Настройки</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">Настройки кабинета</h1>
      <p className="mt-3 text-slate-600">Управляйте email-уведомлениями и текущей сессией.</p>
      <NotificationSettingsForm initial={preferences} />
      <form
        action="/api/auth/logout"
        method="post"
        className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"
      >
        <h2 className="text-xl font-black">Текущая сессия</h2>
        <p className="mt-2 text-sm text-slate-600">{session.email}</p>
        <button className="mt-5 rounded-xl border border-red-200 px-5 py-3 font-bold text-red-700">
          Выйти из кабинета
        </button>
      </form>
    </div>
  );
}
