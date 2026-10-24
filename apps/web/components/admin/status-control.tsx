'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RequestStatus } from '../../lib/requests-store';
import type { Locale } from '../../lib/i18n';

const copy = {
  lv: { options: ['Jauns', 'Procesā', 'Nepieciešams precizējums', 'Atrisināts'], title: 'Pieprasījuma pārvaldība', save: 'Saglabāt', pending: 'Saglabā…', success: 'Statuss saglabāts.', error: 'Neizdevās saglabāt statusu.' },
  ru: { options: ['Новое', 'В работе', 'Нужно уточнение', 'Решено'], title: 'Управление обращением', save: 'Сохранить', pending: 'Сохраняем…', success: 'Статус сохранён.', error: 'Не удалось сохранить статус.' },
  en: { options: ['New', 'In progress', 'Needs clarification', 'Resolved'], title: 'Request management', save: 'Save', pending: 'Saving…', success: 'Status saved.', error: 'Could not save the status.' },
} satisfies Record<Locale, { options: string[]; title: string; save: string; pending: string; success: string; error: string }>;

const values: RequestStatus[] = ['NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED'];

export function StatusControl({
  requestId,
  initialStatus,
  locale,
}: {
  requestId: string;
  initialStatus: RequestStatus;
  locale: Locale;
}) {
  const text = copy[locale];
  const router = useRouter();
  const [status, setStatus] = useState<RequestStatus>(initialStatus);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    setPending(true);
    setMessage('');
    const response = await fetch(`/api/admin/requests/${requestId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setPending(false);
    setMessage(response.ok ? text.success : text.error);
    if (response.ok) router.refresh();
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6">
      <p className="text-xs font-black uppercase tracking-widest text-slate-400">
        {text.title}
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as RequestStatus)}
          className="min-h-12 flex-1 rounded-2xl border border-slate-200 px-4 font-bold outline-none focus:border-blue-600"
        >
          {values.map((value, index) => (
            <option key={value} value={value}>
              {text.options[index]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-full bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-60"
        >
          {pending ? text.pending : text.save}
        </button>
      </div>
      {message && <p className="mt-3 text-sm font-bold text-slate-600">{message}</p>}
    </div>
  );
}
