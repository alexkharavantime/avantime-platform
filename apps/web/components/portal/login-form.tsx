'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm({
  returnTo,
  demoEnabled,
  oidcMfa = false,
  oidcEnrollmentRequired = false,
  oidcError = false,
}: {
  returnTo?: string;
  demoEnabled: boolean;
  oidcMfa?: boolean;
  oidcEnrollmentRequired?: boolean;
  oidcError?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(demoEnabled ? 'demo@avantime.lv' : '');
  const [password, setPassword] = useState(demoEnabled ? 'avantime' : '');
  const [error, setError] = useState(
    oidcError ? 'Корпоративный вход не выполнен. Начните вход заново.' : '',
  );
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [challengeToken, setChallengeToken] = useState(oidcMfa ? 'oidc-cookie' : '');
  const [mfaCode, setMfaCode] = useState('');
  const [enrollmentRequired, setEnrollmentRequired] = useState(oidcEnrollmentRequired);

  useEffect(() => setHydrated(true), []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const mfaPending = Boolean(challengeToken);
    const oidcMfaPending = challengeToken === 'oidc-cookie';
    const response = await fetch(
      oidcMfaPending
        ? '/api/auth/oidc/mfa/challenge'
        : mfaPending
          ? '/api/auth/mfa/challenge'
          : '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          oidcMfaPending
            ? { code: mfaCode }
            : mfaPending
              ? { challengeToken, code: mfaCode }
              : { email, password, returnTo },
        ),
      },
    );
    const data = (await response.json()) as {
      error?: string;
      role?: 'CLIENT' | 'ADMIN';
      mfaRequired?: boolean;
      challengeToken?: string;
      enrollmentRequired?: boolean;
      returnTo?: string;
    };
    setPending(false);
    if (!response.ok) return setError(data.error ?? 'Не удалось войти.');
    if (data.mfaRequired && data.challengeToken) {
      setChallengeToken(data.challengeToken);
      setEnrollmentRequired(Boolean(data.enrollmentRequired));
      setPassword('');
      return;
    }
    router.push(data.returnTo ?? returnTo ?? (data.role === 'ADMIN' ? '/admin' : '/portal'));
    router.refresh();
  }

  function useAdminDemo() {
    setEmail('admin@avantime.lv');
    setPassword('admin');
    setError('');
  }

  function useClientDemo() {
    setEmail('demo@avantime.lv');
    setPassword('avantime');
    setError('');
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      {demoEnabled && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={useClientDemo}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:border-blue-500"
          >
            Клиент
          </button>
          <button
            type="button"
            onClick={useAdminDemo}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:border-blue-500"
          >
            Администратор
          </button>
        </div>
      )}
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-slate-700">Email</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="username"
          disabled={Boolean(challengeToken)}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600"
        />
      </label>
      {challengeToken ? (
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-700">
            Код MFA или recovery code
          </span>
          <input
            value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            disabled={enrollmentRequired}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600"
          />
        </label>
      ) : (
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-700">Пароль</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600"
          />
        </label>
      )}
      {enrollmentRequired && (
        <p
          role="alert"
          className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"
        >
          Политика организации требует MFA. Обратитесь к администратору для безопасного
          первоначального подключения.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
      <Link
        href="/portal/forgot-password"
        className="block text-center text-sm font-bold text-blue-700"
      >
        Забыли пароль?
      </Link>
      <button
        disabled={pending || !hydrated || enrollmentRequired}
        className="w-full rounded-full bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-60"
      >
        {pending ? 'Проверяем…' : challengeToken ? 'Подтвердить' : 'Войти'}
      </button>
      {challengeToken && (
        <button
          type="button"
          onClick={() => {
            setChallengeToken('');
            setMfaCode('');
            setEnrollmentRequired(false);
            setError('');
          }}
          className="w-full text-sm font-bold text-slate-600"
        >
          Начать вход заново
        </button>
      )}
      {demoEnabled && (
        <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-500">
          <p>
            <strong>Клиент:</strong> demo@avantime.lv / avantime
          </p>
          <p>
            <strong>Администратор:</strong> admin@avantime.lv / admin
          </p>
        </div>
      )}
    </form>
  );
}
