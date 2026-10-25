import { redirect } from 'next/navigation';

import { SecuritySettings } from '../../../../components/portal/security-settings';
import { getSecurityOverview } from '../../../../lib/identity-management';
import { getValidatedPortalSession } from '../../../../lib/portal-session';
import { getLocale } from '../../../../lib/i18n-server';
import { localePath, type Locale } from '../../../../lib/i18n';

const copy: Record<Locale, { eyebrow: string; title: string; description: string }> = {
  lv: { eyebrow: 'Iestatījumi', title: 'Drošība', description: 'Pārvaldiet MFA, atkopšanas kodus, paroli un aktīvās sesijas.' },
  ru: { eyebrow: 'Настройки', title: 'Безопасность', description: 'Управляйте MFA, резервными кодами, паролем и активными сессиями.' },
  en: { eyebrow: 'Settings', title: 'Security', description: 'Manage MFA, recovery codes, your password and active sessions.' },
};

export default async function PortalSecurityPage() {
  const locale = await getLocale();
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login?returnTo=/portal/settings/security'));
  const overview = await getSecurityOverview(session);
  const text = copy[locale];
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-6">
      <p className="eyebrow">{text.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">{text.title}</h1>
      <p className="mt-3 text-slate-600">{text.description}</p>
      <SecuritySettings initial={overview} currentEmail={session.email} locale={locale} />
    </div>
  );
}
