'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const RESET_STORAGE_KEY = 'avantime.password-reset';

export function ResetPasswordForm() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const stored = window.sessionStorage.getItem(RESET_STORAGE_KEY);
    if (stored) setToken(stored);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = (await response.json()) as { message?: string; error?: string };
    setMessage(data.error ?? data.message ?? '');
    if (response.ok) {
      window.sessionStorage.removeItem(RESET_STORAGE_KEY);
      router.replace('/portal/login');
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-bold">Код восстановления</span>
        <input
          type="password"
          autoComplete="one-time-code"
          required
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold">Новый пароль</span>
        <input
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3"
        />
      </label>
      <p className="text-sm text-slate-600">
        От 12 до 128 символов; не используйте email или распространённый пароль.
      </p>
      <button className="w-full rounded-full bg-blue-600 px-5 py-3 font-black text-white">
        Изменить пароль
      </button>
      {message && (
        <p role="status" className="rounded-2xl bg-slate-50 p-4 text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
