'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { localePath, type Locale } from '../../lib/i18n';

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

const emailChangeCopy: Record<
  Locale,
  {
    title: string;
    currentEmail: string;
    newEmail: string;
    submit: string;
    accepted: string;
    notAccepted: string;
    failed: string;
  }
> = {
  lv: {
    title: 'Pieteikšanās e-pasta maiņa',
    currentEmail: 'Pašreizējais e-pasts',
    newEmail: 'Jaunais e-pasts',
    submit: 'Nosūtīt apstiprinājuma saiti',
    accepted: 'Pasta pakalpojums pieņēma apstiprinājuma vēstuli; piegāde nav apstiprināta.',
    notAccepted: 'Vēstule netika pieņemta nosūtīšanai. Pārbaudiet pasta konfigurāciju.',
    failed: 'E-pasta maiņu neizdevās pieprasīt.',
  },
  ru: {
    title: 'Изменить email для входа',
    currentEmail: 'Текущая электронная почта',
    newEmail: 'Новая электронная почта',
    submit: 'Отправить ссылку подтверждения',
    accepted: 'Почтовый сервис принял письмо; доставка ещё не подтверждена.',
    notAccepted: 'Письмо не принято к отправке. Проверьте настройки почты.',
    failed: 'Не удалось запросить смену email.',
  },
  en: {
    title: 'Change login email',
    currentEmail: 'Current email',
    newEmail: 'New email',
    submit: 'Send confirmation link',
    accepted: 'The mail provider accepted the message; delivery is not confirmed.',
    notAccepted: 'The provider did not accept the message. Check mail configuration.',
    failed: 'Could not request an email change.',
  },
};

const securityCopy = {
  lv: { error: 'Darbību neizdevās izpildīt.', enrollment: 'Pievienojiet noslēpumu autentifikatora lietotnei un apstipriniet kodu.', mfaEnabled: 'MFA ieslēgta. Saglabājiet rezerves kodus; tie vairs netiks parādīti.', regenerated: 'Vecie rezerves kodi atsaukti. Saglabājiet jauno komplektu.', sessionRevoked: 'Sesija atsaukta.', sessionsRevoked: 'Pārējās sesijas atsauktas.', policyUpdated: 'MFA politika atjaunināta.', mfa: 'Daudzfaktoru autentifikācija', status: 'Statuss:', on: 'ieslēgta', off: 'izslēgta', policy: 'Politika:', remaining: 'Atlikušie rezerves kodi:', providersLink: 'Pārvaldīt identitātes pakalpojumu sniedzējus un SSO politiku', auditLink: 'Atvērt audita žurnālu', enable: 'Ieslēgt TOTP', secret: 'Noslēpums redzams tikai šīs iestatīšanas laikā:', uri: 'Rādīt autentifikatora URI', code: 'Apstiprinājuma kods', enableConfirm: 'Apstiprināt un ieslēgt', currentTotp: 'Pašreizējais TOTP kods aizsargātai darbībai', regenerate: 'Atjaunot rezerves kodus', disable: 'Izslēgt MFA un pabeigt sesijas', recovery: 'Rezerves kodi — parādīti vienu reizi', providers: 'Korporatīvās pierakstīšanās metodes', providersDescription: 'Pakalpojumu sniedzēji ir tikai konfigurācijas pamats. Aktivizēšanai nepieciešama atsevišķa reālas tenant vides pārbaude.', noProviders: 'Pakalpojumu sniedzēji vēl nav konfigurēti.', enabled: 'Ieslēgts', disabled: 'Izslēgts', identities: 'Saistītās identitātes', verified: 'E-pastu apstiprinājis IdP', unverified: 'E-pasts nav apstiprināts', policyTitle: 'Organizācijas MFA politika', requirement: 'Prasība', optional: 'Neobligāti', admins: 'Administratoriem', allMembers: 'Visiem dalībniekiem', enforcement: 'Ieviešanas datums', grace: 'Pārejas periods, dienas', savePolicy: 'Saglabāt politiku', sessions: 'Aktīvās sesijas', sessionsDescription: 'Tiek norādīts tikai vispārīgs pārlūka un ierīces veids, bez fingerprinting.', endOthers: 'Pabeigt pārējās', current: '· pašreizējā', activity: 'Aktivitāte:', end: 'Pabeigt', password: 'Mainīt paroli', passwordDescription: 'Pēc paroles maiņas visas sesijas tiks pabeigtas.', currentPassword: 'Pašreizējā parole', newPassword: 'Jaunā parole', changePassword: 'Mainīt paroli', locale: 'lv-LV' },
  ru: { error: 'Не удалось выполнить действие.', enrollment: 'Добавьте секрет в приложение-аутентификатор и подтвердите код.', mfaEnabled: 'MFA включена. Сохраните резервные коды, повторно они не показываются.', regenerated: 'Старые резервные коды отозваны. Сохраните новый набор.', sessionRevoked: 'Сеанс завершён.', sessionsRevoked: 'Остальные сеансы завершены.', policyUpdated: 'Политика MFA обновлена.', mfa: 'Многофакторная аутентификация', status: 'Статус:', on: 'включена', off: 'не включена', policy: 'Политика:', remaining: 'Осталось резервных кодов:', providersLink: 'Управлять поставщиками идентификации и политикой SSO', auditLink: 'Открыть журнал аудита', enable: 'Подключить TOTP', secret: 'Секрет показывается только в этом процессе подключения:', uri: 'Показать URI приложения-аутентификатора', code: 'Код подтверждения', enableConfirm: 'Подтвердить и включить', currentTotp: 'Текущий TOTP-код для защищённого действия', regenerate: 'Перевыпустить резервные коды', disable: 'Отключить MFA и завершить сеансы', recovery: 'Резервные коды — показываются один раз', providers: 'Корпоративные способы входа', providersDescription: 'Провайдеры показаны как настроенная основа. Включение требует отдельной проверки реального tenant.', noProviders: 'Провайдеры пока не настроены.', enabled: 'Включён', disabled: 'Отключён', identities: 'Связанные учётные записи', verified: 'Электронная почта подтверждена IdP', unverified: 'Электронная почта не подтверждена', policyTitle: 'Политика MFA организации', requirement: 'Требование', optional: 'Необязательно', admins: 'Для администраторов', allMembers: 'Для всех участников', enforcement: 'Дата введения', grace: 'Льготный период, дней', savePolicy: 'Сохранить политику', sessions: 'Активные сеансы', sessionsDescription: 'Указывается только общий тип браузера и устройства, без fingerprinting.', endOthers: 'Завершить остальные', current: '· текущий', activity: 'Активность:', end: 'Завершить', password: 'Изменить пароль', passwordDescription: 'После смены пароля все сеансы будут завершены.', currentPassword: 'Текущий пароль', newPassword: 'Новый пароль', changePassword: 'Изменить пароль', locale: 'ru-RU' },
  en: { error: 'The action could not be completed.', enrollment: 'Add the secret to your authenticator app and confirm the code.', mfaEnabled: 'MFA is enabled. Save the backup codes; they will not be shown again.', regenerated: 'Old backup codes were revoked. Save the new set.', sessionRevoked: 'Session revoked.', sessionsRevoked: 'Other sessions revoked.', policyUpdated: 'MFA policy updated.', mfa: 'Multifactor authentication', status: 'Status:', on: 'enabled', off: 'not enabled', policy: 'Policy:', remaining: 'Backup codes remaining:', providersLink: 'Manage identity providers and SSO policy', auditLink: 'Open audit log', enable: 'Enable TOTP', secret: 'The secret is shown only during this setup:', uri: 'Show authenticator URI', code: 'Verification code', enableConfirm: 'Confirm and enable', currentTotp: 'Current TOTP code for protected actions', regenerate: 'Regenerate backup codes', disable: 'Disable MFA and end sessions', recovery: 'Backup codes — shown once', providers: 'Corporate sign-in methods', providersDescription: 'Providers are shown as configured foundations. Enabling one requires a separate validation against a live tenant.', noProviders: 'No providers are configured yet.', enabled: 'Enabled', disabled: 'Disabled', identities: 'Linked identities', verified: 'Email verified by IdP', unverified: 'Email not verified', policyTitle: 'Organization MFA policy', requirement: 'Requirement', optional: 'Optional', admins: 'For administrators', allMembers: 'For all members', enforcement: 'Enforcement date', grace: 'Grace period, days', savePolicy: 'Save policy', sessions: 'Active sessions', sessionsDescription: 'Only the general browser and device type is shown; no fingerprinting.', endOthers: 'End other sessions', current: '· current', activity: 'Activity:', end: 'End session', password: 'Change password', passwordDescription: 'Changing the password ends all sessions.', currentPassword: 'Current password', newPassword: 'New password', changePassword: 'Change password', locale: 'en-GB' },
} satisfies Record<Locale, Record<string, string>>;

async function postJson(path: string, body: Record<string, unknown>, errorMessage: string) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(errorMessage);
  }
  return data;
}

async function putJson(path: string, body: Record<string, unknown>, errorMessage: string) {
  const response = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(errorMessage);
  }
  return data;
}

export function SecuritySettings({
  initial,
  currentEmail,
  locale,
}: {
  initial: SecurityOverview;
  currentEmail: string;
  locale: Locale;
}) {
  const router = useRouter();
  const [overview, setOverview] = useState(initial);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [actionCode, setActionCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [policyRequirement, setPolicyRequirement] = useState(initial.policy.requirement);
  const [policyGraceDays, setPolicyGraceDays] = useState(initial.policy.gracePeriodDays);
  const [policyEnforcementAt, setPolicyEnforcementAt] = useState(
    initial.policy.enforcementAt?.slice(0, 16) ?? '',
  );
  const emailCopy = emailChangeCopy[locale];
  const text = securityCopy[locale];
  const policyLabel = {
    OPTIONAL: text.optional,
    ADMINS: text.admins,
    ALL_MEMBERS: text.allMembers,
  }[overview.policy.requirement];

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
      setMessage(error instanceof Error ? error.message : text.error);
    } finally {
      setPending(false);
    }
  }

  function beginEnrollment() {
    void run(async () => {
      const data = await postJson('/api/account/security/mfa/totp/enroll', {}, text.error);
      setEnrollment(data as Enrollment);
      setRecoveryCodes([]);
      setMessage(text.enrollment);
    });
  }

  function confirmEnrollment() {
    if (!enrollment) return;
    void run(async () => {
      const data = await postJson('/api/account/security/mfa/totp/confirm', {
        methodId: enrollment.methodId,
        code: totpCode,
      }, text.error);
      setRecoveryCodes(data.recoveryCodes as string[]);
      setEnrollment(null);
      setTotpCode('');
      setMessage(text.mfaEnabled);
      await refresh();
    });
  }

  function regenerateCodes() {
    void run(async () => {
      const data = await postJson('/api/account/security/recovery-codes/regenerate', {
        code: actionCode,
      }, text.error);
      setRecoveryCodes(data.recoveryCodes as string[]);
      setActionCode('');
      setMessage(text.regenerated);
      await refresh();
    });
  }

  function disableMfa() {
    void run(async () => {
      await postJson('/api/account/security/mfa/totp/disable', {
        code: actionCode,
      }, text.error);
      router.push(localePath(locale, '/portal/login'));
      router.refresh();
    });
  }

  function revokeSession(sessionId: string) {
    void run(async () => {
      const data = await postJson('/api/account/security/sessions/revoke', {
        sessionId,
      }, text.error);
      if (data.signedOut) {
        router.push(localePath(locale, '/portal/login'));
        router.refresh();
        return;
      }
      await refresh();
      setMessage(text.sessionRevoked);
    });
  }

  function revokeOthers() {
    void run(async () => {
      await postJson('/api/account/security/sessions/revoke-others', {}, text.error);
      await refresh();
      setMessage(text.sessionsRevoked);
    });
  }

  function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      await postJson('/api/account/security/password', {
        currentPassword,
        newPassword,
      }, text.error);
      setCurrentPassword('');
      setNewPassword('');
      router.push(localePath(locale, '/portal/login'));
      router.refresh();
    });
  }

  function requestEmailChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const response = await fetch('/api/account/security/email-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, locale }),
      });
      if (!response.ok) throw new Error(emailCopy.failed);
      const result = (await response.json()) as { emailAccepted?: boolean };
      setNewEmail('');
      setMessage(result.emailAccepted ? emailCopy.accepted : emailCopy.notAccepted);
    });
  }

  function updatePolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      await putJson('/api/account/security/policy', {
        requirement: policyRequirement,
        gracePeriodDays: policyGraceDays,
        enforcementAt: policyEnforcementAt ? new Date(policyEnforcementAt).toISOString() : null,
      }, text.error);
      await refresh();
      setMessage(text.policyUpdated);
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
        <h2 className="text-xl font-black">{text.mfa}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {text.status} {overview.mfa.enabled ? text.on : text.off}. {text.policy}{' '}
          {policyLabel}. {text.remaining}{' '}
          {overview.mfa.recoveryCodesRemaining}.
        </p>
        {overview.policy.canManageProviders && (
          <Link
            href={localePath(locale, '/portal/settings/security/identity-providers')}
            className="mt-4 inline-flex rounded-xl border border-blue-300 px-4 py-2 text-sm font-bold text-blue-700"
          >
            {text.providersLink}
          </Link>
        )}
        {overview.policy.canViewAudit && (
          <Link
            href={localePath(locale, '/portal/settings/security/audit')}
            className="ml-3 mt-4 inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
          >
            {text.auditLink}
          </Link>
        )}
        {!overview.mfa.enabled && !enrollment && (
          <button
            type="button"
            disabled={pending}
            onClick={beginEnrollment}
            className="mt-5 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60"
          >
            {text.enable}
          </button>
        )}
        {enrollment && (
          <div className="mt-5 space-y-4 rounded-xl bg-slate-50 p-5">
            <QRCodeSVG
              value={enrollment.otpauthUri}
              size={208}
              level="M"
              role="img"
              aria-label={text.uri}
            />
            <p className="text-sm font-bold">
              {text.secret}
            </p>
            <code className="block break-all rounded-lg bg-white p-3 text-sm">
              {enrollment.secret}
            </code>
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                {text.uri}
              </summary>
              <code className="mt-2 block break-all rounded-lg bg-white p-3 text-xs">
                {enrollment.otpauthUri}
              </code>
            </details>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">{text.code}</span>
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
              {text.enableConfirm}
            </button>
          </div>
        )}
        {overview.mfa.enabled && (
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-bold">
                {text.currentTotp}
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
                {text.regenerate}
              </button>
              {!overview.policy.required && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={disableMfa}
                  className="rounded-xl border border-red-200 px-5 py-3 font-bold text-red-700"
                >
                  {text.disable}
                </button>
              )}
            </div>
          </div>
        )}
        {recoveryCodes.length > 0 && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="font-black">{text.recovery}</h3>
            <ul className="mt-3 grid gap-2 font-mono text-sm sm:grid-cols-2">
              {recoveryCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-black">{text.providers}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {text.providersDescription}
        </p>
        <ul className="mt-5 divide-y divide-slate-200">
          {overview.identityProviders.length === 0 && (
            <li className="py-4 text-sm text-slate-600">{text.noProviders}</li>
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
                {provider.enabled ? text.enabled : text.disabled}
              </span>
            </li>
          ))}
        </ul>
        {overview.externalIdentities.length > 0 && (
          <>
            <h3 className="mt-6 font-black">{text.identities}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {overview.externalIdentities.map((identity) => (
                <li key={identity.id}>
                  {identity.providerName} ·{' '}
                  {identity.emailVerified ? text.verified : text.unverified}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {overview.policy.canManage && (
        <form onSubmit={updatePolicy} className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-black">{text.policyTitle}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label>
              <span className="mb-2 block text-sm font-bold">{text.requirement}</span>
              <select
                value={policyRequirement}
                onChange={(event) =>
                  setPolicyRequirement(event.target.value as 'OPTIONAL' | 'ADMINS' | 'ALL_MEMBERS')
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              >
                <option value="OPTIONAL">{text.optional}</option>
                <option value="ADMINS">{text.admins}</option>
                <option value="ALL_MEMBERS">{text.allMembers}</option>
              </select>
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold">{text.enforcement}</span>
              <input
                type="datetime-local"
                value={policyEnforcementAt}
                onChange={(event) => setPolicyEnforcementAt(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold">{text.grace}</span>
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
            {text.savePolicy}
          </button>
        </form>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">{text.sessions}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {text.sessionsDescription}
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={revokeOthers}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold"
          >
            {text.endOthers}
          </button>
        </div>
        <ul className="mt-5 divide-y divide-slate-200">
          {overview.sessions.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div>
                <p className="font-bold">
                  {item.deviceLabel} {item.current ? text.current : ''}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {text.activity} {new Date(item.lastActivityAt).toLocaleString(text.locale)}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => revokeSession(item.id)}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-700"
              >
                {text.end}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <form
        onSubmit={requestEmailChange}
        className="rounded-2xl border border-slate-200 bg-white p-6"
      >
        <h2 className="text-xl font-black">{emailCopy.title}</h2>
        <p className="mt-2 break-all text-sm text-slate-600">
          {emailCopy.currentEmail}: {currentEmail}
        </p>
        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-bold">{emailCopy.newEmail}</span>
          <input
            type="email"
            autoComplete="email"
            maxLength={320}
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
            required
          />
        </label>
        <button
          disabled={pending}
          className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-60"
        >
          {emailCopy.submit}
        </button>
      </form>

      <form onSubmit={updatePassword} className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-black">{text.password}</h2>
        <p className="mt-2 text-sm text-slate-600">{text.passwordDescription}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-bold">{text.currentPassword}</span>
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
            <span className="mb-2 block text-sm font-bold">{text.newPassword}</span>
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
          {text.changePassword}
        </button>
      </form>
    </div>
  );
}
