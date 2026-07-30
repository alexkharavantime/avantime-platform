'use client';

import { FormEvent, useState } from 'react';

export function TeamInviteForm() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        email: form.get('email'),
        jobTitle: form.get('jobTitle'),
      }),
    });
    const data = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) return setMessage(data.error ?? 'Не удалось добавить пользователя.');
    setMessage('Пользователь добавлен. Обновите страницу, чтобы увидеть его в списке.');
    event.currentTarget.reset();
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-black">Добавить сотрудника</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="grid gap-2">
          <span className="text-sm font-bold text-slate-700">Имя</span>
          <input
            name="name"
            required
            autoComplete="name"
            className="rounded-2xl border border-slate-300 px-4 py-3"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-bold text-slate-700">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-2xl border border-slate-300 px-4 py-3"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-bold text-slate-700">Должность</span>
          <input name="jobTitle" className="rounded-2xl border border-slate-300 px-4 py-3" />
        </label>
      </div>
      <div className="mt-5 flex items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-60"
        >
          {busy ? 'Добавляем…' : 'Добавить'}
        </button>
        {message && (
          <p role="status" className="text-sm font-bold text-slate-600">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
