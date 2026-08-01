import { redirect } from 'next/navigation';

import { IdentityProviderForm } from '../../../../../../components/portal/identity-provider-form';
import { getValidatedPortalSession } from '../../../../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../../../../lib/organization-permissions';

export default async function NewIdentityProviderPage() {
  const session = await getValidatedPortalSession();
  if (!session) {
    redirect('/portal/login?returnTo=/portal/settings/security/identity-providers/new');
  }
  if (!hasOrganizationPermission(session, 'identity.providers.manage')) redirect('/portal');
  const origin = process.env.AUTH_PUBLIC_ORIGIN?.trim() ?? '';
  const callbackUri = origin ? new URL('/api/auth/oidc/callback', origin).toString() : '';
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6">
      <p className="eyebrow">Identity provider</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">Новая OIDC конфигурация</h1>
      <IdentityProviderForm callbackUri={callbackUri} />
    </div>
  );
}
