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

const copy = {
  lv: { cancelled: 'Obligātā SSO maiņa atcelta.', prompt: 'Ievadiet REQUIRE SSO, lai apstiprinātu obligāto SSO.', error: 'SSO politiku neizdevās atjaunināt.', saved: 'SSO politika atjaunināta.', heading: 'Organizācijas SSO politika', description: 'Obligātais SSO ir pieejams tikai iespējotam un tenant validētam pakalpojumu sniedzējam. Tenant izvēlas serveris, izmantojot organizācijas dalību.', mode: 'Režīms', disabled: 'SSO atspējots', optional: 'SSO nav obligāts', required: 'SSO obligāts', provider: 'Pakalpojumu sniedzējs', choose: 'Izvēlieties pakalpojumu sniedzēju', off: 'atspējots', enforcement: 'Ieviešanas datums', grace: 'Pārejas periods, dienas', localLogin: 'Atļaut pieteikšanos ar paroli', save: 'Saglabāt SSO politiku' },
  ru: { cancelled: 'Изменение обязательного SSO отменено.', prompt: 'Введите REQUIRE SSO для подтверждения обязательного SSO.', error: 'Не удалось обновить политику SSO.', saved: 'Политика SSO обновлена.', heading: 'Политика SSO организации', description: 'Обязательный SSO доступен только для включённого и проверенного поставщика. Организацию выбирает сервер по членству в tenant.', mode: 'Режим', disabled: 'SSO выключен', optional: 'SSO необязателен', required: 'SSO обязателен', provider: 'Поставщик', choose: 'Выберите поставщика', off: 'выключен', enforcement: 'Дата включения', grace: 'Льготный период, дней', localLogin: 'Разрешить вход по паролю', save: 'Сохранить политику SSO' },
  en: { cancelled: 'Required SSO change cancelled.', prompt: 'Enter REQUIRE SSO to confirm required SSO.', error: 'Could not update the SSO policy.', saved: 'SSO policy updated.', heading: 'Organization SSO policy', description: 'Required SSO is available only for an enabled, tenant-validated provider. The server selects the tenant from membership.', mode: 'Mode', disabled: 'SSO disabled', optional: 'SSO optional', required: 'SSO required', provider: 'Provider', choose: 'Select a provider', off: 'disabled', enforcement: 'Enforcement date', grace: 'Grace period, days', localLogin: 'Allow password sign-in', save: 'Save SSO policy' },
} as const;

export function OrganizationSsoPolicyForm({
  initial,
  providers,
  locale,
}: {
  initial: Policy;
  providers: ProviderOption[];
  locale: keyof typeof copy;
}) {
  const router = useRouter();
  const [requirement, setRequirement] = useState(initial.requirement);
  const [providerId, setProviderId] = useState(initial.providerId ?? '');
  const [enforcementAt, setEnforcementAt] = useState(initial.enforcementAt?.slice(0, 16) ?? '');
  const [gracePeriodDays, setGracePeriodDays] = useState(initial.gracePeriodDays);
  const [localLoginAllowed, setLocalLoginAllowed] = useState(initial.localLoginAllowed);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const text = copy[locale];

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const confirmation =
      requirement === 'REQUIRED'
        ? window.prompt(text.prompt)
        : undefined;
    if (requirement === 'REQUIRED' && confirmation !== 'REQUIRE SSO') {
      setMessage(text.cancelled);
      return;
    }
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
          confirmation,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(text.error);
      setMessage(text.saved);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-black">{text.heading}</h2>
      <p className="mt-2 text-sm text-slate-600">{text.description}</p>
      {message && (
        <p role="status" className="mt-4 rounded-xl bg-blue-50 p-3 text-sm">
          {message}
        </p>
      )}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label>
          <span className="mb-2 block text-sm font-bold">{text.mode}</span>
          <select
            value={requirement}
            onChange={(event) => setRequirement(event.target.value as Policy['requirement'])}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="DISABLED">{text.disabled}</option>
            <option value="OPTIONAL">{text.optional}</option>
            <option value="REQUIRED">{text.required}</option>
          </select>
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold">{text.provider}</span>
          <select
            value={providerId}
            disabled={requirement === 'DISABLED'}
            onChange={(event) => setProviderId(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 disabled:opacity-60"
          >
            <option value="">{text.choose}</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.displayName} · {provider.validationStatus}
                {provider.enabled ? '' : ` · ${text.off}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold">{text.enforcement}</span>
          <input
            type="datetime-local"
            value={enforcementAt}
            onChange={(event) => setEnforcementAt(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold">{text.grace}</span>
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
            {text.localLogin}
          </label>
        )}
      </div>
      <button
        disabled={pending}
        className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-60"
      >
        {text.save}
      </button>
    </form>
  );
}
