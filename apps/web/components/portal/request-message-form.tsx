'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function RequestMessageForm({ requestId }: { requestId: string }) {
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
    const data = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) return setError(data.error ?? 'Не удалось добавить сообщение.');
    setBody('');
    idempotencyKey.current = null;
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-5">
      <label htmlFor="request-comment" className="mb-2 block text-sm font-bold text-slate-700">
        Комментарий
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
        placeholder="Добавить уточнение или комментарий"
      />
      <p className="mt-2 text-sm font-bold text-red-700" role="status" aria-live="polite">
        {error || (pending ? 'Комментарий сохраняется и ставится в очередь Jira…' : '')}
      </p>
      <button
        disabled={pending || !body.trim()}
        className="mt-3 rounded-full bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-50"
      >
        {pending ? 'Отправляем…' : 'Добавить сообщение'}
      </button>
    </form>
  );
}
