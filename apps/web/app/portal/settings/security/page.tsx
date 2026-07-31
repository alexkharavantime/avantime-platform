import { redirect } from 'next/navigation';

import { SecuritySettings } from '../../../../components/portal/security-settings';
import { getSecurityOverview } from '../../../../lib/identity-management';
import { getValidatedPortalSession } from '../../../../lib/portal-session';

export default async function PortalSecurityPage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/portal/settings/security');
  const overview = await getSecurityOverview(session);
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-6">
      <p className="eyebrow">Настройки</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">Безопасность</h1>
      <p className="mt-3 text-slate-600">
        Управляйте MFA, recovery codes, паролем и активными сессиями.
      </p>
      <SecuritySettings initial={overview} />
    </div>
  );
}
