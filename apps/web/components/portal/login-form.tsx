'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm({ returnTo, demoEnabled }: { returnTo?: string; demoEnabled: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(demoEnabled ? 'demo@avantime.lv' : '');
  const [password, setPassword] = useState(demoEnabled ? 'avantime' : '');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = (await response.json()) as { error?: string; role?: 'CLIENT' | 'ADMIN' };
    setPending(false);
    if (!response.ok) return setError(data.error ?? 'Не удалось войти.');
    router.push(returnTo ?? (data.role === 'ADMIN' ? '/admin' : '/portal'));
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
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-slate-700">Пароль</span>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600"
        />
      </label>
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
        disabled={pending || !hydrated}
        className="w-full rounded-full bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-60"
      >
        {pending ? 'Входим…' : 'Войти'}
      </button>
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
