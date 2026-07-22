'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function NewRequestForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form)) });
    const data = (await response.json()) as { error?: string; request?: { id: string } };
    setPending(false);
    if (!response.ok || !data.request) return setError(data.error ?? 'Не удалось создать обращение.');
    router.push(`/portal/requests/${data.request.id}`); router.refresh();
  }

  return <form onSubmit={submit} className="mt-8 grid gap-5">
    <label><span className="mb-2 block text-sm font-black text-slate-700">Тема</span><input name="title" required className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600" placeholder="Кратко опишите задачу" /></label>
    <div className="grid gap-5 md:grid-cols-2">
      <label><span className="mb-2 block text-sm font-black text-slate-700">Категория</span><select name="category" className="w-full rounded-2xl border border-slate-200 px-4 py-3"><option>1С</option><option>Интеграция</option><option>Agent+</option><option>AI</option><option>Инфраструктура</option><option>Другое</option></select></label>
      <label><span className="mb-2 block text-sm font-black text-slate-700">Приоритет</span><select name="priority" className="w-full rounded-2xl border border-slate-200 px-4 py-3"><option value="LOW">Низкий</option><option value="NORMAL">Обычный</option><option value="HIGH">Высокий</option><option value="CRITICAL">Критический</option></select></label>
    </div>
    <label><span className="mb-2 block text-sm font-black text-slate-700">Описание</span><textarea name="description" required rows={7} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600" placeholder="Что произошло, какой результат ожидается, когда возникла проблема" /></label>
    {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    <button disabled={pending} className="w-fit rounded-full bg-blue-600 px-7 py-3 font-black text-white disabled:opacity-60">{pending ? 'Создаем…' : 'Создать обращение'}</button>
  </form>;
}
