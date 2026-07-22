'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RequestMessageForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError('');
    const response = await fetch(`/api/requests/${requestId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
    const data = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) return setError(data.error ?? 'Не удалось добавить сообщение.');
    setBody(''); router.refresh();
  }

  return <form onSubmit={submit} className="mt-5">
    <textarea value={body} onChange={(event)=>setBody(event.target.value)} rows={4} required minLength={2} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600" placeholder="Добавить уточнение или комментарий" />
    {error && <p className="mt-2 text-sm font-bold text-red-700">{error}</p>}
    <button disabled={pending || !body.trim()} className="mt-3 rounded-full bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-50">{pending ? 'Отправляем…' : 'Добавить сообщение'}</button>
  </form>;
}
