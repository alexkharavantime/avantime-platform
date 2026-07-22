'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RequestStatus } from '../../lib/requests-store';

const options: Array<{ value: RequestStatus; label: string }> = [
  { value: 'NEW', label: 'Новое' },
  { value: 'IN_PROGRESS', label: 'В работе' },
  { value: 'WAITING_CUSTOMER', label: 'Нужно уточнение' },
  { value: 'RESOLVED', label: 'Решено' },
];

export function StatusControl({ requestId, initialStatus }: { requestId: string; initialStatus: RequestStatus }) {
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
    setMessage(response.ok ? 'Статус сохранен.' : 'Не удалось сохранить статус.');
    if (response.ok) router.refresh();
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6">
      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Управление обращением</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <select value={status} onChange={(event)=>setStatus(event.target.value as RequestStatus)} className="min-h-12 flex-1 rounded-2xl border border-slate-200 px-4 font-bold outline-none focus:border-blue-600">
          {options.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button type="button" onClick={save} disabled={pending} className="rounded-full bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-60">{pending ? 'Сохраняем…' : 'Сохранить'}</button>
      </div>
      {message && <p className="mt-3 text-sm font-bold text-slate-600">{message}</p>}
    </div>
  );
}
