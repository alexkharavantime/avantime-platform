import { redirect } from 'next/navigation';

import { ProfileForm } from '../../../components/portal/profile-form';
import { getAccountProfile } from '../../../lib/account';
import { getValidatedPortalSession } from '../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../lib/organization-permissions';
import { localePath, type Locale } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';

const copy: Record<Locale, { eyebrow: string; title: string; description: string }> = {
  lv: { eyebrow: 'Profils', title: 'Uzņēmums un kontaktinformācija', description: 'Šie dati tiek izmantoti pieprasījumos un atļautajās integrācijās.' },
  ru: { eyebrow: 'Профиль', title: 'Компания и контактные данные', description: 'Данные используются в обращениях и разрешённых интеграциях.' },
  en: { eyebrow: 'Profile', title: 'Company and contact details', description: 'These details are used in requests and permitted integrations.' },
};

export default async function PortalCompanyPage() {
  const locale = await getLocale();
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login?returnTo=/portal/company'));
  if (!hasOrganizationPermission(session, 'organization.view')) redirect(localePath(locale, '/portal'));
  const profile = await getAccountProfile(session);
  const text = copy[locale];
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-6">
      <p className="eyebrow">{text.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">{text.title}</h1>
      <p className="mt-3 text-slate-600">{text.description}</p>
      <ProfileForm
        initialProfile={profile}
        canUpdateCompany={hasOrganizationPermission(session, 'organization.update')}
        locale={locale}
      />
    </div>
  );
}
