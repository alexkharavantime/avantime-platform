import { redirect } from 'next/navigation';

import { ProfileForm } from '../../../components/portal/profile-form';
import { getAccountProfile } from '../../../lib/account';
import { getValidatedPortalSession } from '../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../lib/organization-permissions';

export default async function PortalCompanyPage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/portal/company');
  if (!hasOrganizationPermission(session, 'organization.view')) redirect('/portal');
  const profile = await getAccountProfile(session);
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-6">
      <p className="eyebrow">Профиль</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">Компания и контактные данные</h1>
      <p className="mt-3 text-slate-600">
        Данные используются в обращениях и разрешённых интеграциях.
      </p>
      <ProfileForm
        initialProfile={profile}
        canUpdateCompany={hasOrganizationPermission(session, 'organization.update')}
      />
    </div>
  );
}
