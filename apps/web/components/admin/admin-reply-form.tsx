'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '../../lib/i18n';

const copy = {
  lv: { title: 'Atbilde klientam', placeholder: 'Uzrakstiet precizējumu, risinājumu vai papildu informācijas pieprasījumu…', pending: 'Sūta…', submit: 'Pievienot atbildi', success: 'Atbilde pievienota pieprasījumam.', error: 'Neizdevās nosūtīt atbildi.' },
  ru: { title: 'Ответ клиенту', placeholder: 'Напишите уточнение, решение или запрос дополнительной информации…', pending: 'Отправляем…', submit: 'Добавить ответ', success: 'Ответ добавлен в обращение.', error: 'Не удалось отправить ответ.' },
  en: { title: 'Reply to customer', placeholder: 'Write a clarification, solution or request for more information…', pending: 'Sending…', submit: 'Add reply', success: 'Reply added to the request.', error: 'Could not send the reply.' },
} satisfies Record<Locale, { title: string; placeholder: string; pending: string; submit: string; success: string; error: string }>;

export function AdminReplyForm({ requestId, locale }: { requestId: string; locale: Locale }) {
  const text = copy[locale];
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
      setMessage(text.error);
      return;
    }
    setBody('');
    setMessage(text.success);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6">
      <p className="text-xs font-black uppercase tracking-widest text-slate-400">{text.title}</p>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={5}
        placeholder={text.placeholder}
        className="mt-4 w-full rounded-2xl border border-slate-200 p-4 leading-7 outline-none focus:border-blue-600"
      />
      <button
        disabled={pending || !body.trim()}
        className="mt-4 rounded-full bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-50"
      >
        {pending ? text.pending : text.submit}
      </button>
      {message && <p className="mt-3 text-sm font-bold text-slate-600">{message}</p>}
    </form>
  );
}
