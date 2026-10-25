'use client';

import { FormEvent, useState } from 'react';
import type { OrganizationRole } from '../../lib/session';
import type { Locale } from '../../lib/i18n';

const copy: Record<Locale, { roles: Record<Exclude<OrganizationRole, 'OWNER'>, string>; error: string; success: string; title: string; name: string; role: string; email: string; job: string; pending: string; add: string }> = {
  lv: { roles: { ADMIN: 'Administrators', MANAGER: 'Vadītājs', MEMBER: 'Dalībnieks', VIEWER: 'Skatītājs' }, error: 'Neizdevās pievienot lietotāju.', success: 'Uzaicinājums izveidots. Piekļuve būs pieejama pēc apstiprināšanas.', title: 'Pievienot darbinieku', name: 'Vārds', role: 'Loma', email: 'E-pasts', job: 'Amats', pending: 'Pievieno…', add: 'Pievienot' },
  ru: { roles: { ADMIN: 'Администратор', MANAGER: 'Менеджер', MEMBER: 'Участник', VIEWER: 'Наблюдатель' }, error: 'Не удалось добавить пользователя.', success: 'Приглашение создано. Доступ появится только после подтверждения.', title: 'Добавить сотрудника', name: 'Имя', role: 'Роль', email: 'Электронная почта', job: 'Должность', pending: 'Добавляем…', add: 'Добавить' },
  en: { roles: { ADMIN: 'Administrator', MANAGER: 'Manager', MEMBER: 'Member', VIEWER: 'Viewer' }, error: 'Could not add the user.', success: 'Invitation created. Access will be available after confirmation.', title: 'Add a team member', name: 'Name', role: 'Role', email: 'Email', job: 'Job title', pending: 'Adding…', add: 'Add' },
};

export function TeamInviteForm({ roles, locale }: { roles: Exclude<OrganizationRole, 'OWNER'>[]; locale: Locale }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const text = copy[locale];

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
        role: form.get('role'),
      }),
    });
    const data = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) return setMessage(text.error);
    setMessage(text.success);
    event.currentTarget.reset();
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-black">{text.title}</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-2">
          <span className="text-sm font-bold text-slate-700">{text.name}</span>
          <input
            name="name"
            required
            autoComplete="name"
            className="rounded-2xl border border-slate-300 px-4 py-3"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-bold text-slate-700">{text.role}</span>
          <select name="role" className="rounded-2xl border border-slate-300 px-4 py-3">
            {roles.map((role) => (
              <option key={role} value={role}>
                {text.roles[role]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-bold text-slate-700">{text.email}</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-2xl border border-slate-300 px-4 py-3"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-bold text-slate-700">{text.job}</span>
          <input name="jobTitle" className="rounded-2xl border border-slate-300 px-4 py-3" />
        </label>
      </div>
      <div className="mt-5 flex items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-60"
        >
          {busy ? text.pending : text.add}
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
