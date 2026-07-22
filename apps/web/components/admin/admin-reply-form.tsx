'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AdminReplyForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    setMessage('');
    const response = await fetch(`/api/requests/${requestId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    setPending(false);
    if (!response.ok) {
      setMessage('Не удалось отправить ответ.');
      return;
    }
    setBody('');
    setMessage('Ответ добавлен в обращение.');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6">
      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Ответ клиенту</p>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={5}
        placeholder="Напишите уточнение, решение или запрос дополнительной информации…"
        className="mt-4 w-full rounded-2xl border border-slate-200 p-4 leading-7 outline-none focus:border-blue-600"
      />
      <button disabled={pending || !body.trim()} className="mt-4 rounded-full bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-50">
        {pending ? 'Отправляем…' : 'Добавить ответ'}
      </button>
      {message && <p className="mt-3 text-sm font-bold text-slate-600">{message}</p>}
    </form>
  );
}
