'use client';

import { useState } from 'react';
import type { AccountProfile } from '../../lib/account';

export function ProfileForm({ initialProfile }: { initialProfile: AccountProfile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('saving');
    setMessage('');
    const response = await fetch('/api/account', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setState('error');
      setMessage(data.error ?? 'Не удалось сохранить изменения.');
      return;
    }
    setState('saved');
    setMessage('Изменения сохранены.');
  }

  const field = (key: keyof AccountProfile, label: string, disabled = false) => (
    <label className="grid gap-2">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input
        value={profile[key]}
        disabled={disabled}
        onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
        className="rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );

  return (
    <form onSubmit={submit} className="mt-8 grid gap-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="grid gap-5 md:grid-cols-2">
        {field('name', 'Имя и фамилия')}
        {field('email', 'Email', true)}
        {field('phone', 'Телефон')}
        {field('jobTitle', 'Должность')}
      </div>
      <div className="border-t border-slate-200 pt-6">
        <h2 className="text-2xl font-black">Компания</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {field('companyName', 'Название компании')}
          {field('registrationNumber', 'Регистрационный номер')}
          <div className="md:col-span-2">{field('address', 'Адрес')}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button disabled={state === 'saving'} className="rounded-full bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-60">
          {state === 'saving' ? 'Сохраняем…' : 'Сохранить изменения'}
        </button>
        {message && <p className={`font-bold ${state === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{message}</p>}
      </div>
    </form>
  );
}
