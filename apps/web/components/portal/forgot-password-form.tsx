'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const RESET_STORAGE_KEY = 'avantime.password-reset';

export function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [result, setResult] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as {
      message?: string;
      error?: string;
      resetToken?: string;
    };
    setResult(data.error ?? data.message ?? '');
    if (data.resetToken) {
      window.sessionStorage.setItem(RESET_STORAGE_KEY, data.resetToken);
      router.push('/portal/reset-password');
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-bold">Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3"
        />
      </label>
      <button className="w-full rounded-full bg-blue-600 px-5 py-3 font-black text-white">
        Получить инструкцию
      </button>
      {result && (
        <p role="status" className="rounded-2xl bg-slate-50 p-4 text-sm leading-6">
          {result}
        </p>
      )}
    </form>
  );
}
