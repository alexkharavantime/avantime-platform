'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { localePath, type Locale } from '../../lib/i18n';

type SafeProvider = {
  id: string;
  key: string;
  profile: 'MICROSOFT_ENTRA_ID' | 'GOOGLE_WORKSPACE' | 'GENERIC_OIDC';
  displayName: string;
  issuer: string;
  discoveryUrl: string;
  clientId: string;
  hasClientSecretReference: boolean;
  secretKeyVersion: string | null;
  redirectUris: string[];
  allowedEmailDomains: string[];
  organizationMappingMode: 'STATIC' | 'PROVIDER_TENANT_CLAIM' | 'HOSTED_DOMAIN' | 'CLAIM';
  tenantMappingPolicy: Record<string, unknown>;
  claimMapping: Record<string, unknown>;
  groupMapping: Record<string, unknown>;
  sessionPolicy: 'PRESERVE_EXISTING' | 'REVOKE_ON_DISABLE';
  metadataRefreshedAt: string | null;
  metadataExpiresAt: string | null;
  validationStatus:
    | 'NOT_VALIDATED'
    | 'METADATA_VALIDATED'
    | 'TENANT_VALIDATED'
    | 'REVALIDATION_REQUIRED'
    | 'FAILED';
  validationEvidenceRef: string | null;
  configurationVersion: number;
  enabled: boolean;
};

const defaultClaims = {
  subject: 'sub',
  email: 'email',
  emailVerified: 'email_verified',
  tenant: 'tid',
  groups: 'groups',
  hostedDomain: 'hd',
};

const copy: Record<Locale, Record<string, string>> = {
  lv: { error: 'Darbību neizdevās pabeigt.', metadata: 'Discovery metadati ir apstiprināti. Reālā tenant validācija joprojām ir obligāta.', validation: 'Validācija un ieviešana', status: 'Statuss', version: 'Konfigurācijas versija', secretSet: 'iestatīts · atslēga', secretMissing: 'nav iestatīts', evidenceMissing: 'Reālā tenant validācija nav reģistrēta', checkMetadata: 'Pārbaudīt discovery metadatus', disable: 'Atspējot jaunas pieteikšanās', enable: 'Iespējot pēc validācijas', checkTenant: 'Pārbaudīt īsto tenant', linkIdentity: 'Saistīt pašreizējo identitāti', configuration: 'Pakalpojuma sniedzēja konfigurācija', secretHelp: 'Client secret netiek saglabāts šeit: norādiet tikai write-only atsauci no apstiprinātas noslēpumu glabātuves.', profile: 'Pakalpojuma sniedzēja veids', key: 'Stabilā atslēga', displayName: 'Parādāmais nosaukums', newSecret: 'Jauna client-secret atsauce', allowlist: 'Atļauto Redirect URI saraksts — pa vienam URI rindā', domains: 'Atļautie e-pasta/domēna nosaukumi', mapping: 'Organizācijas kartēšana', tenantPolicy: 'Tenant kartēšanas politika', claims: 'Apliecinājumu kartēšana', groups: 'Grupu kartēšana (tikai CLIENT)', sessionPolicy: 'Sesijas pēc atspējošanas', revokeSessions: 'Atsaukt pakalpojuma sesijas', preserveSessions: 'Saglabāt esošās sesijas', issuerChange: 'Apstiprinu izdevēja maiņu: pakalpojums tiks atspējots, un būs jāveic pilna atkārtota validācija.', saving: 'Saglabā…', save: 'Saglabāt konfigurāciju' },
  ru: { error: 'Не удалось выполнить операцию.', metadata: 'Метаданные Discovery подтверждены. Реальная проверка tenant по-прежнему обязательна.', validation: 'Проверка и запуск', status: 'Статус', version: 'Версия конфигурации', secretSet: 'настроен · ключ', secretMissing: 'не настроен', evidenceMissing: 'Реальная проверка tenant не записана', checkMetadata: 'Проверить метаданные Discovery', disable: 'Отключить новые входы', enable: 'Включить после проверки', checkTenant: 'Проверить реальный tenant', linkIdentity: 'Связать текущую учётную запись', configuration: 'Конфигурация поставщика', secretHelp: 'Client secret здесь не сохраняется: укажите только write-only ссылку на одобренное хранилище секретов.', profile: 'Тип поставщика', key: 'Стабильный ключ', displayName: 'Отображаемое имя', newSecret: 'Новая ссылка на client secret', allowlist: 'Список разрешённых Redirect URI, по одному URI в строке', domains: 'Разрешённые email и домены', mapping: 'Связь с организацией', tenantPolicy: 'Политика сопоставления tenant', claims: 'Сопоставление claims', groups: 'Сопоставление групп (только CLIENT)', sessionPolicy: 'Сессии после отключения', revokeSessions: 'Отозвать сессии поставщика', preserveSessions: 'Сохранить текущие сессии', issuerChange: 'Подтверждаю смену issuer: поставщик будет отключён и потребует полной повторной проверки.', saving: 'Сохраняем…', save: 'Сохранить конфигурацию' },
  en: { error: 'The operation could not be completed.', metadata: 'Discovery metadata confirmed. Real tenant validation is still required.', validation: 'Validation and rollout', status: 'Status', version: 'Configuration version', secretSet: 'configured · key', secretMissing: 'not configured', evidenceMissing: 'Real tenant validation is not recorded', checkMetadata: 'Check discovery metadata', disable: 'Disable new sign-ins', enable: 'Enable after validation', checkTenant: 'Validate real tenant', linkIdentity: 'Link current identity', configuration: 'Provider configuration', secretHelp: 'Client secrets are not stored here. Provide only a write-only reference from the approved secret boundary.', profile: 'Provider type', key: 'Stable key', displayName: 'Display name', newSecret: 'New client-secret reference', allowlist: 'Redirect URI allowlist, one URI per line', domains: 'Allowed email and hosted domains', mapping: 'Organization mapping', tenantPolicy: 'Tenant mapping policy', claims: 'Claim mapping', groups: 'Group mapping (CLIENT only)', sessionPolicy: 'Sessions after disable', revokeSessions: 'Revoke provider sessions', preserveSessions: 'Preserve existing sessions', issuerChange: 'I confirm this issuer change: the provider will be disabled and require full revalidation.', saving: 'Saving…', save: 'Save configuration' },
};

function prettyJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

export function IdentityProviderForm({
  initial,
  callbackUri,
  locale,
}: {
  initial?: SafeProvider;
  callbackUri: string;
  locale: Locale;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<SafeProvider['profile']>(
    initial?.profile ?? 'GENERIC_OIDC',
  );
  const [key, setKey] = useState(initial?.key ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [issuer, setIssuer] = useState(initial?.issuer ?? '');
  const [discoveryUrl, setDiscoveryUrl] = useState(initial?.discoveryUrl ?? '');
  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const [clientSecretReference, setClientSecretReference] = useState('');
  const [redirectUris, setRedirectUris] = useState(
    (initial?.redirectUris ?? [callbackUri]).join('\n'),
  );
  const [allowedDomains, setAllowedDomains] = useState(
    initial?.allowedEmailDomains.join('\n') ?? '',
  );
  const [mappingMode, setMappingMode] = useState<SafeProvider['organizationMappingMode']>(
    initial?.organizationMappingMode ?? 'STATIC',
  );
  const [tenantMappingPolicy, setTenantMappingPolicy] = useState(
    prettyJson(initial?.tenantMappingPolicy ?? {}),
  );
  const [claimMapping, setClaimMapping] = useState(
    prettyJson(initial?.claimMapping ?? defaultClaims),
  );
  const [groupMapping, setGroupMapping] = useState(prettyJson(initial?.groupMapping ?? {}));
  const [sessionPolicy, setSessionPolicy] = useState<SafeProvider['sessionPolicy']>(
    initial?.sessionPolicy ?? 'REVOKE_ON_DISABLE',
  );
  const [controlledIssuerRevalidation, setControlledIssuerRevalidation] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const text = copy[locale];

  async function request(path: string, method: 'POST' | 'PUT', body: unknown) {
    const response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as SafeProvider & { error?: string };
    if (!response.ok) throw new Error(text.error);
    return data;
  }

  function configuration() {
    return {
      key,
      profile,
      displayName,
      issuer,
      discoveryUrl,
      clientId,
      ...(clientSecretReference ? { clientSecretReference } : {}),
      redirectUris: redirectUris
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
      allowedEmailDomains: allowedDomains
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
      organizationMappingMode: mappingMode,
      tenantMappingPolicy: JSON.parse(tenantMappingPolicy) as Record<string, unknown>,
      claimMapping: JSON.parse(claimMapping) as Record<string, unknown>,
      groupMapping: JSON.parse(groupMapping) as Record<string, unknown>,
      defaultRole: 'CLIENT',
      sessionPolicy,
    };
  }

  async function run(operation: () => Promise<void>) {
    setPending(true);
    setMessage('');
    try {
      await operation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.error);
    } finally {
      setPending(false);
    }
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const provider = initial
        ? await request(`/api/account/security/identity-providers/${initial.id}`, 'PUT', {
            ...configuration(),
            expectedVersion: initial.configurationVersion,
            controlledIssuerRevalidation,
          })
        : await request('/api/account/security/identity-providers', 'POST', configuration());
      router.push(localePath(locale, `/portal/settings/security/identity-providers/${encodeURIComponent(provider.id)}`));
      router.refresh();
    });
  }

  function refreshMetadata() {
    if (!initial) return;
    void run(async () => {
      await request(`/api/account/security/identity-providers/${initial.id}/metadata`, 'POST', {
        expectedVersion: initial.configurationVersion,
      });
      setMessage(text.metadata);
      router.refresh();
    });
  }

  function setEnabled(enabled: boolean) {
    if (!initial) return;
    void run(async () => {
      await request(`/api/account/security/identity-providers/${initial.id}/status`, 'POST', {
        enabled,
        expectedVersion: initial.configurationVersion,
      });
      router.refresh();
    });
  }

  return (
    <div className="mt-8 space-y-6">
      {message && (
        <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
          {message}
        </p>
      )}
      {initial && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-black">{text.validation}</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-bold">{text.status}</dt>
              <dd>{initial.validationStatus}</dd>
            </div>
            <div>
              <dt className="font-bold">{text.version}</dt>
              <dd>{initial.configurationVersion}</dd>
            </div>
            <div>
              <dt className="font-bold">Secret reference</dt>
              <dd>
                {initial.hasClientSecretReference
                  ? `${text.secretSet} ${initial.secretKeyVersion ?? 'unknown'}`
                  : text.secretMissing}
              </dd>
            </div>
            <div>
              <dt className="font-bold">Evidence</dt>
              <dd>{initial.validationEvidenceRef ?? text.evidenceMissing}</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={refreshMetadata}
              className="rounded-xl border border-slate-300 px-4 py-2 font-bold"
            >
              {text.checkMetadata}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setEnabled(!initial.enabled)}
              className="rounded-xl bg-slate-950 px-4 py-2 font-bold text-white disabled:opacity-60"
            >
              {initial.enabled ? text.disable : text.enable}
            </button>
            {!initial.enabled && initial.validationStatus === 'METADATA_VALIDATED' && (
              <a
                href={`/api/auth/oidc/${encodeURIComponent(initial.key)}/authorize?mode=validate`}
                className="rounded-xl border border-emerald-300 px-4 py-2 font-bold text-emerald-700"
              >
                {text.checkTenant}
              </a>
            )}
            {initial.enabled && (
              <a
                href={`/api/auth/oidc/${encodeURIComponent(initial.key)}/authorize?mode=link`}
                className="rounded-xl border border-blue-300 px-4 py-2 font-bold text-blue-700"
              >
                {text.linkIdentity}
              </a>
            )}
          </div>
        </section>
      )}

      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-black">{text.configuration}</h2>
        <p className="mt-2 text-sm text-slate-600">{text.secretHelp}</p>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-bold">{text.profile}</span>
            <select
              value={profile}
              onChange={(event) => setProfile(event.target.value as SafeProvider['profile'])}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="MICROSOFT_ENTRA_ID">Microsoft Entra ID</option>
              <option value="GOOGLE_WORKSPACE">Google Workspace OIDC</option>
              <option value="GENERIC_OIDC">Generic enterprise OIDC</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">{text.key}</span>
            <input
              required
              value={key}
              onChange={(event) => setKey(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">{text.displayName}</span>
            <input
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Client ID</span>
            <input
              required
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-bold">Issuer</span>
            <input
              required
              value={issuer}
              onChange={(event) => setIssuer(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-bold">Discovery URL</span>
            <input
              required
              value={discoveryUrl}
              onChange={(event) => setDiscoveryUrl(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-bold">{text.newSecret}</span>
            <input
              value={clientSecretReference}
              onChange={(event) => setClientSecretReference(event.target.value)}
              placeholder="env:OIDC_CLIENT_SECRET or secret-manager://…"
              autoComplete="off"
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-bold">
              {text.allowlist}
            </span>
            <textarea
              required
              rows={3}
              value={redirectUris}
              onChange={(event) => setRedirectUris(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm"
            />
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">{text.domains}</span>
            <textarea
              rows={4}
              value={allowedDomains}
              onChange={(event) => setAllowedDomains(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm"
            />
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">{text.mapping}</span>
            <select
              value={mappingMode}
              onChange={(event) =>
                setMappingMode(event.target.value as SafeProvider['organizationMappingMode'])
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="STATIC">{locale === 'ru' ? 'Поставщик → организация' : locale === 'lv' ? 'Pakalpojuma sniedzējs → organizācija' : 'Static provider → organization'}</option>
              <option value="PROVIDER_TENANT_CLAIM">{locale === 'ru' ? 'Tenant claim поставщика' : locale === 'lv' ? 'Pakalpojuma sniedzēja tenant claim' : 'Provider tenant claim'}</option>
              <option value="HOSTED_DOMAIN">{locale === 'ru' ? 'Claim домена' : locale === 'lv' ? 'Hostētā domēna claim' : 'Hosted domain claim'}</option>
              <option value="CLAIM">{locale === 'ru' ? 'Разрешённый custom claim' : locale === 'lv' ? 'Atļauts pielāgots claim' : 'Allowlisted custom claim'}</option>
            </select>
          </label>
          {[
            [text.tenantPolicy, tenantMappingPolicy, setTenantMappingPolicy],
            [text.claims, claimMapping, setClaimMapping],
            [text.groups, groupMapping, setGroupMapping],
          ].map(([label, value, setter]) => (
            <label key={label as string} className="md:col-span-2">
              <span className="mb-2 block text-sm font-bold">{label as string}</span>
              <textarea
                rows={5}
                value={value as string}
                onChange={(event) =>
                  (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm"
              />
            </label>
          ))}
          <label>
            <span className="mb-2 block text-sm font-bold">{text.sessionPolicy}</span>
            <select
              value={sessionPolicy}
              onChange={(event) =>
                setSessionPolicy(event.target.value as SafeProvider['sessionPolicy'])
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="REVOKE_ON_DISABLE">{text.revokeSessions}</option>
              <option value="PRESERVE_EXISTING">{text.preserveSessions}</option>
            </select>
          </label>
          {initial && initial.issuer !== issuer && (
            <label className="flex items-center gap-3 self-end rounded-xl bg-amber-50 p-4 text-sm">
              <input
                type="checkbox"
                checked={controlledIssuerRevalidation}
                onChange={(event) => setControlledIssuerRevalidation(event.target.checked)}
              />
              {text.issuerChange}
            </label>
          )}
        </div>
        <button
          disabled={pending}
          className="mt-6 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60"
        >
          {pending ? text.saving : text.save}
        </button>
      </form>
    </div>
  );
}
