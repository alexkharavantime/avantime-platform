'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type SecurityOverview = {
  mfa: {
    enabled: boolean;
    recoveryCodesRemaining: number;
  };
  policy: {
    requirement: 'OPTIONAL' | 'ADMINS' | 'ALL_MEMBERS';
    enforcementAt: string | null;
    gracePeriodDays: number;
    required: boolean;
    enrollmentRequired: boolean;
    canManage: boolean;
    canManageProviders: boolean;
    canViewAudit: boolean;
  };
  sessions: Array<{
    id: string;
    current: boolean;
    deviceLabel: string;
    createdAt: string;
    lastActivityAt: string;
    expiresAt: string;
  }>;
  identityProviders: Array<{
    id: string;
    key: string;
    kind: 'OIDC' | 'SAML';
    profile: 'MICROSOFT_ENTRA_ID' | 'GOOGLE_WORKSPACE' | 'GENERIC_OIDC' | null;
    displayName: string;
    enabled: boolean;
  }>;
  externalIdentities: Array<{
    id: string;
    providerKey: string;
    providerName: string;
    kind: 'OIDC' | 'SAML';
    emailVerified: boolean;
    linkedAt: string;
  }>;
};

type Enrollment = {
  methodId: string;
  secret: string;
  otpauthUri: string;
};

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Операция не выполнена.');
  }
  return data;
}

async function putJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Операция не выполнена.');
  }
  return data;
}

export function SecuritySettings({ initial }: { initial: SecurityOverview }) {
  const router = useRouter();
  const [overview, setOverview] = useState(initial);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [actionCode, setActionCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [policyRequirement, setPolicyRequirement] = useState(initial.policy.requirement);
  const [policyGraceDays, setPolicyGraceDays] = useState(initial.policy.gracePeriodDays);
  const [policyEnforcementAt, setPolicyEnforcementAt] = useState(
    initial.policy.enforcementAt?.slice(0, 16) ?? '',
  );

  async function refresh() {
    const response = await fetch('/api/account/security', { cache: 'no-store' });
    if (response.ok) setOverview((await response.json()) as SecurityOverview);
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Операция не выполнена.');
    } finally {
      setPending(false);
    }
  }

  function beginEnrollment() {
    void run(async () => {
      const data = await postJson('/api/account/security/mfa/totp/enroll', {});
      setEnrollment(data as Enrollment);
      setRecoveryCodes([]);
      setMessage('Добавьте секрет в приложение-аутентификатор и подтвердите код.');
    });
  }

  function confirmEnrollment() {
    if (!enrollment) return;
    void run(async () => {
      const data = await postJson('/api/account/security/mfa/totp/confirm', {
        methodId: enrollment.methodId,
        code: totpCode,
      });
      setRecoveryCodes(data.recoveryCodes as string[]);
      setEnrollment(null);
      setTotpCode('');
      setMessage('MFA включена. Сохраните recovery codes сейчас: повторно они не показываются.');
      await refresh();
    });
  }

  function regenerateCodes() {
    void run(async () => {
      const data = await postJson('/api/account/security/recovery-codes/regenerate', {
        code: actionCode,
      });
      setRecoveryCodes(data.recoveryCodes as string[]);
      setActionCode('');
      setMessage('Старые recovery codes отозваны. Сохраните новый набор сейчас.');
      await refresh();
    });
  }

  function disableMfa() {
    void run(async () => {
      await postJson('/api/account/security/mfa/totp/disable', {
        code: actionCode,
      });
      router.push('/portal/login');
      router.refresh();
    });
  }

  function revokeSession(sessionId: string) {
    void run(async () => {
      const data = await postJson('/api/account/security/sessions/revoke', {
        sessionId,
      });
      if (data.signedOut) {
        router.push('/portal/login');
        router.refresh();
        return;
      }
      await refresh();
      setMessage('Сессия отозвана.');
    });
  }

  function revokeOthers() {
    void run(async () => {
      await postJson('/api/account/security/sessions/revoke-others', {});
      await refresh();
      setMessage('Остальные сессии отозваны.');
    });
  }

  function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      await postJson('/api/account/security/password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      router.push('/portal/login');
      router.refresh();
    });
  }

  function updatePolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      await putJson('/api/account/security/policy', {
        requirement: policyRequirement,
        gracePeriodDays: policyGraceDays,
        enforcementAt: policyEnforcementAt ? new Date(policyEnforcementAt).toISOString() : null,
      });
      await refresh();
      setMessage('Политика MFA обновлена.');
    });
  }

  return (
    <div className="mt-8 space-y-8">
      {message && (
        <p role="status" className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">
          {message}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-black">Многофакторная аутентификация</h2>
        <p className="mt-2 text-sm text-slate-600">
          Статус: {overview.mfa.enabled ? 'включена' : 'не включена'}. Политика:{' '}
          {overview.policy.requirement}. Recovery codes осталось:{' '}
          {overview.mfa.recoveryCodesRemaining}.
        </p>
        {overview.policy.canManageProviders && (
          <Link
            href="/portal/settings/security/identity-providers"
            className="mt-4 inline-flex rounded-xl border border-blue-300 px-4 py-2 text-sm font-bold text-blue-700"
          >
            Управлять identity providers и SSO policy
          </Link>
        )}
        {overview.policy.canViewAudit && (
          <Link
            href="/portal/settings/security/audit"
            className="ml-3 mt-4 inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
          >
            Открыть журнал аудита
          </Link>
        )}
        {!overview.mfa.enabled && !enrollment && (
          <button
            type="button"
            disabled={pending}
            onClick={beginEnrollment}
            className="mt-5 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60"
          >
            Подключить TOTP
          </button>
        )}
        {enrollment && (
          <div className="mt-5 space-y-4 rounded-xl bg-slate-50 p-5">
            <p className="text-sm font-bold">
              Секрет показывается только в этом процессе подключения:
            </p>
            <code className="block break-all rounded-lg bg-white p-3 text-sm">
              {enrollment.secret}
            </code>
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                Показать URI для аутентификатора
              </summary>
              <code className="mt-2 block break-all rounded-lg bg-white p-3 text-xs">
                {enrollment.otpauthUri}
              </code>
            </details>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">Код подтверждения</span>
              <input
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={confirmEnrollment}
              className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60"
            >
              Подтвердить и включить
            </button>
          </div>
        )}
        {overview.mfa.enabled && (
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-bold">
                Текущий TOTP-код для защищённого действия
              </span>
              <input
                value={actionCode}
                onChange={(event) => setActionCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={regenerateCodes}
                className="rounded-xl border border-slate-300 px-5 py-3 font-bold"
              >
                Перевыпустить recovery codes
              </button>
              {!overview.policy.required && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={disableMfa}
                  className="rounded-xl border border-red-200 px-5 py-3 font-bold text-red-700"
                >
                  Отключить MFA и завершить сессии
                </button>
              )}
            </div>
          </div>
        )}
        {recoveryCodes.length > 0 && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="font-black">Recovery codes — показываются один раз</h3>
            <ul className="mt-3 grid gap-2 font-mono text-sm sm:grid-cols-2">
              {recoveryCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-black">Корпоративные способы входа</h2>
        <p className="mt-2 text-sm text-slate-600">
          Провайдеры показываются только как настроенный foundation. Включение требует отдельной
          проверки реального tenant.
        </p>
        <ul className="mt-5 divide-y divide-slate-200">
          {overview.identityProviders.length === 0 && (
            <li className="py-4 text-sm text-slate-600">Провайдеры пока не настроены.</li>
          )}
          {overview.identityProviders.map((provider) => (
            <li key={provider.id} className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="font-bold">{provider.displayName}</p>
                <p className="text-xs text-slate-500">
                  {provider.profile ?? provider.kind} · {provider.key}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                {provider.enabled ? 'Включён' : 'Отключён'}
              </span>
            </li>
          ))}
        </ul>
        {overview.externalIdentities.length > 0 && (
          <>
            <h3 className="mt-6 font-black">Связанные identities</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {overview.externalIdentities.map((identity) => (
                <li key={identity.id}>
                  {identity.providerName} ·{' '}
                  {identity.emailVerified ? 'email подтверждён IdP' : 'email не подтверждён'}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {overview.policy.canManage && (
        <form onSubmit={updatePolicy} className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-black">Политика MFA организации</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label>
              <span className="mb-2 block text-sm font-bold">Требование</span>
              <select
                value={policyRequirement}
                onChange={(event) =>
                  setPolicyRequirement(event.target.value as 'OPTIONAL' | 'ADMINS' | 'ALL_MEMBERS')
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              >
                <option value="OPTIONAL">Необязательно</option>
                <option value="ADMINS">Для администраторов</option>
                <option value="ALL_MEMBERS">Для всех участников</option>
              </select>
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold">Дата enforcement</span>
              <input
                type="datetime-local"
                value={policyEnforcementAt}
                onChange={(event) => setPolicyEnforcementAt(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold">Grace period, дней</span>
              <input
                type="number"
                min={0}
                max={365}
                value={policyGraceDays}
                onChange={(event) => setPolicyGraceDays(Number(event.target.value))}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </label>
          </div>
          <button
            disabled={pending}
            className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-60"
          >
            Сохранить политику
          </button>
        </form>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Активные сессии</h2>
            <p className="mt-2 text-sm text-slate-600">
              Указывается только общий тип браузера и устройства, без fingerprinting.
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={revokeOthers}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold"
          >
            Завершить остальные
          </button>
        </div>
        <ul className="mt-5 divide-y divide-slate-200">
          {overview.sessions.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div>
                <p className="font-bold">
                  {item.deviceLabel} {item.current ? '· текущая' : ''}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Активность: {new Date(item.lastActivityAt).toLocaleString('ru-RU')}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => revokeSession(item.id)}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-700"
              >
                Завершить
              </button>
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={updatePassword} className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-black">Изменить пароль</h2>
        <p className="mt-2 text-sm text-slate-600">После изменения все сессии будут завершены.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-bold">Текущий пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              required
            />
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Новый пароль</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              required
            />
          </label>
        </div>
        <button
          disabled={pending}
          className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-60"
        >
          Изменить пароль
        </button>
      </form>
    </div>
  );
}
