'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type ProviderOption = {
  id: string;
  displayName: string;
  enabled: boolean;
  validationStatus: string;
};

type Policy = {
  requirement: 'DISABLED' | 'OPTIONAL' | 'REQUIRED';
  providerId: string | null;
  enforcementAt: string | null;
  gracePeriodDays: number;
  localLoginAllowed: boolean;
  configurationVersion: number;
};

export function OrganizationSsoPolicyForm({
  initial,
  providers,
}: {
  initial: Policy;
  providers: ProviderOption[];
}) {
  const router = useRouter();
  const [requirement, setRequirement] = useState(initial.requirement);
  const [providerId, setProviderId] = useState(initial.providerId ?? '');
  const [enforcementAt, setEnforcementAt] = useState(initial.enforcementAt?.slice(0, 16) ?? '');
  const [gracePeriodDays, setGracePeriodDays] = useState(initial.gracePeriodDays);
  const [localLoginAllowed, setLocalLoginAllowed] = useState(initial.localLoginAllowed);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try {
      const response = await fetch('/api/account/security/identity-providers/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement,
          providerId: requirement === 'DISABLED' ? null : providerId || null,
          enforcementAt: enforcementAt ? new Date(enforcementAt).toISOString() : null,
          gracePeriodDays,
          localLoginAllowed: requirement === 'REQUIRED' ? false : localLoginAllowed,
          expectedVersion: initial.configurationVersion,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'SSO policy не обновлена.');
      setMessage('SSO policy обновлена.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'SSO policy не обновлена.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-black">Organization SSO policy</h2>
      <p className="mt-2 text-sm text-slate-600">
        Required SSO разрешается только для включённого tenant-validated provider. Tenant выбирается
        сервером из ADMIN session.
      </p>
      {message && (
        <p role="status" className="mt-4 rounded-xl bg-blue-50 p-3 text-sm">
          {message}
        </p>
      )}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label>
          <span className="mb-2 block text-sm font-bold">Режим</span>
          <select
            value={requirement}
            onChange={(event) => setRequirement(event.target.value as Policy['requirement'])}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="DISABLED">SSO отключён</option>
            <option value="OPTIONAL">SSO необязателен</option>
            <option value="REQUIRED">SSO обязателен</option>
          </select>
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold">Провайдер</span>
          <select
            value={providerId}
            disabled={requirement === 'DISABLED'}
            onChange={(event) => setProviderId(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 disabled:opacity-60"
          >
            <option value="">Выберите провайдера</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.displayName} · {provider.validationStatus}
                {provider.enabled ? '' : ' · disabled'}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold">Enforcement date</span>
          <input
            type="datetime-local"
            value={enforcementAt}
            onChange={(event) => setEnforcementAt(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold">Grace period, дней</span>
          <input
            type="number"
            min={0}
            max={365}
            value={gracePeriodDays}
            onChange={(event) => setGracePeriodDays(Number(event.target.value))}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </label>
        {requirement === 'OPTIONAL' && (
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={localLoginAllowed}
              onChange={(event) => setLocalLoginAllowed(event.target.checked)}
            />
            Разрешить local password login
          </label>
        )}
      </div>
      <button
        disabled={pending}
        className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-60"
      >
        Сохранить SSO policy
      </button>
    </form>
  );
}
