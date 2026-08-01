import { notFound, redirect } from 'next/navigation';

import { IdentityProviderForm } from '../../../../../../components/portal/identity-provider-form';
import { getOidcProvider } from '../../../../../../lib/oidc-provider-configuration';
import { getValidatedPortalSession } from '../../../../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../../../../lib/organization-permissions';

export default async function IdentityProviderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getValidatedPortalSession();
  if (!session) {
    redirect('/portal/login?returnTo=/portal/settings/security/identity-providers');
  }
  if (!hasOrganizationPermission(session, 'identity.providers.manage')) redirect('/portal');
  try {
    const provider = await getOidcProvider(session, (await params).id);
    const origin = process.env.AUTH_PUBLIC_ORIGIN?.trim() ?? '';
    const callbackUri = origin
      ? new URL('/api/auth/oidc/callback', origin).toString()
      : (provider.redirectUris[0] ?? '');
    return (
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6">
        <p className="eyebrow">Identity provider</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">{provider.displayName}</h1>
        <IdentityProviderForm initial={provider} callbackUri={callbackUri} />
      </div>
    );
  } catch {
    notFound();
  }
}
