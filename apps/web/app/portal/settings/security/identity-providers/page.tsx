import Link from 'next/link';
import { redirect } from 'next/navigation';

import { OrganizationSsoPolicyForm } from '../../../../../components/portal/organization-sso-policy-form';
import {
  getOrganizationSsoPolicy,
  listOidcProviders,
} from '../../../../../lib/oidc-provider-configuration';
import { getValidatedPortalSession } from '../../../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../../../lib/organization-permissions';

export default async function IdentityProvidersPage() {
  const session = await getValidatedPortalSession();
  if (!session) {
    redirect('/portal/login?returnTo=/portal/settings/security/identity-providers');
  }
  if (!hasOrganizationPermission(session, 'identity.providers.manage')) redirect('/portal');
  const [providers, policy] = await Promise.all([
    listOidcProviders(session),
    getOrganizationSsoPolicy(session),
  ]);
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6">
      <p className="eyebrow">Безопасность организации</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight">Identity providers</h1>
          <p className="mt-3 max-w-3xl text-slate-600">
            Tenant-bound конфигурация Microsoft Entra ID, Google Workspace и generic OIDC. Реальная
            provider validation фиксируется только внешней rollout ceremony.
          </p>
        </div>
        <Link
          href="/portal/settings/security/identity-providers/new"
          className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
        >
          Добавить провайдера
        </Link>
      </div>
      <ul className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-6">
        {providers.length === 0 && (
          <li className="py-6 text-sm text-slate-600">OIDC providers не настроены.</li>
        )}
        {providers.map((provider) => (
          <li key={provider.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div>
              <Link
                href={`/portal/settings/security/identity-providers/${provider.id}`}
                className="font-black text-blue-700"
              >
                {provider.displayName}
              </Link>
              <p className="mt-1 text-xs text-slate-500">
                {provider.profile} · {provider.validationStatus} · config v
                {provider.configurationVersion}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
              {provider.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </li>
        ))}
      </ul>
      <OrganizationSsoPolicyForm initial={policy} providers={providers} />
    </div>
  );
}
