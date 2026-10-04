'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '../../lib/i18n';

const copy = {
  lv: { error: 'Neizdevās pievienot ziņojumu.', label: 'Komentārs', placeholder: 'Pievienojiet precizējumu vai komentāru', pendingInfo: 'Komentārs tiek saglabāts un ievietots Jira rindā…', pending: 'Sūta…', submit: 'Pievienot ziņojumu' },
  ru: { error: 'Не удалось добавить сообщение.', label: 'Комментарий', placeholder: 'Добавить уточнение или комментарий', pendingInfo: 'Комментарий сохраняется и ставится в очередь Jira…', pending: 'Отправляем…', submit: 'Добавить сообщение' },
  en: { error: 'Could not add the message.', label: 'Comment', placeholder: 'Add a clarification or comment', pendingInfo: 'The comment is being saved and queued for Jira…', pending: 'Sending…', submit: 'Add message' },
} satisfies Record<Locale, { error: string; label: string; placeholder: string; pendingInfo: string; pending: string; submit: string }>;

export function RequestMessageForm({ requestId, locale }: { requestId: string; locale: Locale }) {
  const text = copy[locale];
  const router = useRouter();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const idempotencyKey = useRef<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    idempotencyKey.current ??= `jira:comment:${crypto.randomUUID()}`;
    const response = await fetch(`/api/requests/${requestId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey.current,
      },
      body: JSON.stringify({ body }),
    });
    setPending(false);
    if (!response.ok) return setError(text.error);
    setBody('');
    idempotencyKey.current = null;
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-5">
      <label htmlFor="request-comment" className="mb-2 block text-sm font-bold text-slate-700">
        {text.label}
      </label>
      <textarea
        id="request-comment"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        required
        minLength={2}
        maxLength={5000}
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600"
        placeholder={text.placeholder}
      />
      <p className="mt-2 text-sm font-bold text-red-700" role="status" aria-live="polite">
        {error || (pending ? text.pendingInfo : '')}
      </p>
      <button
        disabled={pending || !body.trim()}
        className="mt-3 rounded-full bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-50"
      >
        {pending ? text.pending : text.submit}
      </button>
    </form>
  );
}
