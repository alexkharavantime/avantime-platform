'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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

function prettyJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

export function IdentityProviderForm({
  initial,
  callbackUri,
}: {
  initial?: SafeProvider;
  callbackUri: string;
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

  async function request(path: string, method: 'POST' | 'PUT', body: unknown) {
    const response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as SafeProvider & { error?: string };
    if (!response.ok) throw new Error(data.error ?? 'Операция не выполнена.');
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
      setMessage(error instanceof Error ? error.message : 'Операция не выполнена.');
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
      router.push(
        `/portal/settings/security/identity-providers/${encodeURIComponent(provider.id)}`,
      );
      router.refresh();
    });
  }

  function refreshMetadata() {
    if (!initial) return;
    void run(async () => {
      await request(`/api/account/security/identity-providers/${initial.id}/metadata`, 'POST', {
        expectedVersion: initial.configurationVersion,
      });
      setMessage(
        'Discovery metadata подтверждены. Реальная tenant validation всё ещё обязательна.',
      );
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
          <h2 className="text-xl font-black">Validation и rollout</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-bold">Статус</dt>
              <dd>{initial.validationStatus}</dd>
            </div>
            <div>
              <dt className="font-bold">Версия конфигурации</dt>
              <dd>{initial.configurationVersion}</dd>
            </div>
            <div>
              <dt className="font-bold">Secret reference</dt>
              <dd>
                {initial.hasClientSecretReference
                  ? `настроен · key ${initial.secretKeyVersion ?? 'unknown'}`
                  : 'не настроен'}
              </dd>
            </div>
            <div>
              <dt className="font-bold">Evidence</dt>
              <dd>{initial.validationEvidenceRef ?? 'реальная tenant validation не записана'}</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={refreshMetadata}
              className="rounded-xl border border-slate-300 px-4 py-2 font-bold"
            >
              Проверить discovery metadata
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setEnabled(!initial.enabled)}
              className="rounded-xl bg-slate-950 px-4 py-2 font-bold text-white disabled:opacity-60"
            >
              {initial.enabled ? 'Отключить новые входы' : 'Включить после validation'}
            </button>
            {!initial.enabled && initial.validationStatus === 'METADATA_VALIDATED' && (
              <a
                href={`/api/auth/oidc/${encodeURIComponent(initial.key)}/authorize?mode=validate`}
                className="rounded-xl border border-emerald-300 px-4 py-2 font-bold text-emerald-700"
              >
                Проверить реальный tenant
              </a>
            )}
            {initial.enabled && (
              <a
                href={`/api/auth/oidc/${encodeURIComponent(initial.key)}/authorize?mode=link`}
                className="rounded-xl border border-blue-300 px-4 py-2 font-bold text-blue-700"
              >
                Связать текущую identity
              </a>
            )}
          </div>
        </section>
      )}

      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-black">Конфигурация провайдера</h2>
        <p className="mt-2 text-sm text-slate-600">
          Client secret не сохраняется здесь: укажите только write-only reference из approved secret
          boundary.
        </p>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-bold">Тип провайдера</span>
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
            <span className="mb-2 block text-sm font-bold">Stable key</span>
            <input
              required
              value={key}
              onChange={(event) => setKey(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Display name</span>
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
            <span className="mb-2 block text-sm font-bold">Новый client-secret reference</span>
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
              Redirect URI allowlist — по одному URI в строке
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
            <span className="mb-2 block text-sm font-bold">Allowed email/hosted domains</span>
            <textarea
              rows={4}
              value={allowedDomains}
              onChange={(event) => setAllowedDomains(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm"
            />
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Organization mapping</span>
            <select
              value={mappingMode}
              onChange={(event) =>
                setMappingMode(event.target.value as SafeProvider['organizationMappingMode'])
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="STATIC">Static provider → organization</option>
              <option value="PROVIDER_TENANT_CLAIM">Provider tenant claim</option>
              <option value="HOSTED_DOMAIN">Hosted domain claim</option>
              <option value="CLAIM">Allowlisted custom claim</option>
            </select>
          </label>
          {[
            ['Tenant mapping policy', tenantMappingPolicy, setTenantMappingPolicy],
            ['Claim mapping', claimMapping, setClaimMapping],
            ['Group mapping (CLIENT only)', groupMapping, setGroupMapping],
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
            <span className="mb-2 block text-sm font-bold">Sessions после disable</span>
            <select
              value={sessionPolicy}
              onChange={(event) =>
                setSessionPolicy(event.target.value as SafeProvider['sessionPolicy'])
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="REVOKE_ON_DISABLE">Отозвать provider sessions</option>
              <option value="PRESERVE_EXISTING">Сохранить существующие sessions</option>
            </select>
          </label>
          {initial && initial.issuer !== issuer && (
            <label className="flex items-center gap-3 self-end rounded-xl bg-amber-50 p-4 text-sm">
              <input
                type="checkbox"
                checked={controlledIssuerRevalidation}
                onChange={(event) => setControlledIssuerRevalidation(event.target.checked)}
              />
              Подтверждаю controlled issuer change: provider будет отключён и потребует полную
              revalidation.
            </label>
          )}
        </div>
        <button
          disabled={pending}
          className="mt-6 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60"
        >
          {pending ? 'Сохраняем…' : 'Сохранить конфигурацию'}
        </button>
      </form>
    </div>
  );
}
