import { redirect } from 'next/navigation';

import { IdentityProviderForm } from '../../../../../../components/portal/identity-provider-form';
import { getValidatedPortalSession } from '../../../../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../../../../lib/organization-permissions';
import { getLocale } from '../../../../../../lib/i18n-server';
import { localePath, type Locale } from '../../../../../../lib/i18n';

const copy: Record<Locale, { eyebrow: string; title: string }> = {
  lv: { eyebrow: 'Identitātes pakalpojumu sniedzējs', title: 'Jauna OIDC konfigurācija' },
  ru: { eyebrow: 'Поставщик идентификации', title: 'Новая конфигурация OIDC' },
  en: { eyebrow: 'Identity provider', title: 'New OIDC configuration' },
};

export default async function NewIdentityProviderPage() {
  const locale = await getLocale();
  const session = await getValidatedPortalSession();
  if (!session) {
    redirect(localePath(locale, '/portal/login?returnTo=/portal/settings/security/identity-providers/new'));
  }
  if (!hasOrganizationPermission(session, 'identity.providers.manage')) redirect(localePath(locale, '/portal'));
  const origin = process.env.AUTH_PUBLIC_ORIGIN?.trim() ?? '';
  const callbackUri = origin ? new URL('/api/auth/oidc/callback', origin).toString() : '';
  const text = copy[locale];
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6">
      <p className="eyebrow">{text.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">{text.title}</h1>
      <IdentityProviderForm callbackUri={callbackUri} locale={locale} />
    </div>
  );
}
