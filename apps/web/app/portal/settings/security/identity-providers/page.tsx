import Link from 'next/link';
import { redirect } from 'next/navigation';

import { OrganizationSsoPolicyForm } from '../../../../../components/portal/organization-sso-policy-form';
import {
  getOrganizationSsoPolicy,
  listOidcProviders,
} from '../../../../../lib/oidc-provider-configuration';
import { getValidatedPortalSession } from '../../../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../../../lib/organization-permissions';
import { getLocale } from '../../../../../lib/i18n-server';
import { localePath, type Locale } from '../../../../../lib/i18n';

const copy: Record<Locale, { eyebrow: string; title: string; description: string; add: string; empty: string; enabled: string; disabled: string }> = {
  lv: { eyebrow: 'Organizācijas drošība', title: 'Identitātes pakalpojumu sniedzēji', description: 'Microsoft Entra ID, Google Workspace un generic OIDC tenant konfigurācija. Reālā provider pārbaude tiek reģistrēta tikai ārējā rollout ceremonijā.', add: 'Pievienot pakalpojumu sniedzēju', empty: 'OIDC pakalpojumu sniedzēji nav konfigurēti.', enabled: 'Iespējots', disabled: 'Atspējots' },
  ru: { eyebrow: 'Безопасность организации', title: 'Поставщики идентификации', description: 'Конфигурация Microsoft Entra ID, Google Workspace и OIDC для организации. Реальная проверка поставщика фиксируется только во внешней церемонии запуска.', add: 'Добавить поставщика', empty: 'Поставщики OIDC не настроены.', enabled: 'Включён', disabled: 'Выключен' },
  en: { eyebrow: 'Organization security', title: 'Identity providers', description: 'Tenant-bound configuration for Microsoft Entra ID, Google Workspace and generic OIDC. Real provider validation is recorded only through the external rollout ceremony.', add: 'Add provider', empty: 'No OIDC providers configured.', enabled: 'Enabled', disabled: 'Disabled' },
};

export default async function IdentityProvidersPage() {
  const locale = await getLocale();
  const session = await getValidatedPortalSession();
  if (!session) {
    redirect(localePath(locale, '/portal/login?returnTo=/portal/settings/security/identity-providers'));
  }
  if (!hasOrganizationPermission(session, 'identity.providers.manage')) redirect(localePath(locale, '/portal'));
  const [providers, policy] = await Promise.all([
    listOidcProviders(session),
    getOrganizationSsoPolicy(session),
  ]);
  const text = copy[locale];
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6">
      <p className="eyebrow">{text.eyebrow}</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight">{text.title}</h1>
          <p className="mt-3 max-w-3xl text-slate-600">{text.description}</p>
        </div>
        <Link
          href={localePath(locale, '/portal/settings/security/identity-providers/new')}
          className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
        >
          {text.add}
        </Link>
      </div>
      <ul className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-6">
        {providers.length === 0 && (
          <li className="py-6 text-sm text-slate-600">{text.empty}</li>
        )}
        {providers.map((provider) => (
          <li key={provider.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div>
              <Link
                href={localePath(locale, `/portal/settings/security/identity-providers/${provider.id}`)}
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
              {provider.enabled ? text.enabled : text.disabled}
            </span>
          </li>
        ))}
      </ul>
      <OrganizationSsoPolicyForm initial={policy} providers={providers} locale={locale} />
    </div>
  );
}
