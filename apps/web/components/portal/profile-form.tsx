'use client';

import { useState } from 'react';
import type { AccountProfile } from '../../lib/account';
import type { Locale } from '../../lib/i18n';

const copy: Record<Locale, Record<string, string>> = {
  lv: { error: 'Neizdevās saglabāt izmaiņas.', saved: 'Izmaiņas saglabātas.', name: 'Vārds un uzvārds', email: 'E-pasts', phone: 'Tālrunis', job: 'Amats', company: 'Uzņēmums', companyName: 'Uzņēmuma nosaukums', registration: 'Reģistrācijas numurs', address: 'Adrese', saving: 'Saglabā…', save: 'Saglabāt izmaiņas' },
  ru: { error: 'Не удалось сохранить изменения.', saved: 'Изменения сохранены.', name: 'Имя и фамилия', email: 'Электронная почта', phone: 'Телефон', job: 'Должность', company: 'Компания', companyName: 'Название компании', registration: 'Регистрационный номер', address: 'Адрес', saving: 'Сохраняем…', save: 'Сохранить изменения' },
  en: { error: 'Could not save changes.', saved: 'Changes saved.', name: 'Full name', email: 'Email', phone: 'Phone', job: 'Job title', company: 'Company', companyName: 'Company name', registration: 'Registration number', address: 'Address', saving: 'Saving…', save: 'Save changes' },
};

export function ProfileForm({
  initialProfile,
  canUpdateCompany,
  locale,
}: {
  initialProfile: AccountProfile;
  canUpdateCompany: boolean;
  locale: Locale;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const text = copy[locale];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('saving');
    setMessage('');
    const response = await fetch('/api/account', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!response.ok) {
      setState('error');
      setMessage(text.error);
      return;
    }
    setState('saved');
    setMessage(text.saved);
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
    <form
      onSubmit={submit}
      className="mt-8 grid gap-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <div className="grid gap-5 md:grid-cols-2">
        {field('name', text.name)}
        {field('email', text.email, true)}
        {field('phone', text.phone)}
        {field('jobTitle', text.job)}
      </div>
      <div className="border-t border-slate-200 pt-6">
        <h2 className="text-2xl font-black">{text.company}</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {field('companyName', text.companyName, !canUpdateCompany)}
          {field('registrationNumber', text.registration, !canUpdateCompany)}
          <div className="md:col-span-2">
            {field('address', text.address, !canUpdateCompany)}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          disabled={state === 'saving'}
          className="rounded-full bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-60"
        >
          {state === 'saving' ? text.saving : text.save}
        </button>
        {message && (
          <p
            role={state === 'error' ? 'alert' : 'status'}
            className={`font-bold ${state === 'error' ? 'text-red-600' : 'text-emerald-600'}`}
          >
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
