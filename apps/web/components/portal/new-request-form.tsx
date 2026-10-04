'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { localePath, type Locale } from '../../lib/i18n';

const copy: Record<Locale, Record<string, string>> = {
  lv: { error: 'Neizdevās izveidot pieprasījumu. Mēģiniet vēlreiz.', title: 'Tēma', titlePlaceholder: 'Īsi aprakstiet uzdevumu', category: 'Kategorija', integration: 'Integrācija', infrastructure: 'Infrastruktūra', other: 'Cits', priority: 'Prioritāte', low: 'Zema', normal: 'Parasta', high: 'Augsta', critical: 'Kritiska', description: 'Apraksts', descriptionPlaceholder: 'Kas notika, kāds rezultāts ir sagaidāms un kad radās problēma', creating: 'Veido…', create: 'Izveidot pieprasījumu' },
  ru: { error: 'Не удалось создать обращение. Повторите попытку.', title: 'Тема', titlePlaceholder: 'Кратко опишите задачу', category: 'Категория', integration: 'Интеграция', infrastructure: 'Инфраструктура', other: 'Другое', priority: 'Приоритет', low: 'Низкий', normal: 'Обычный', high: 'Высокий', critical: 'Критический', description: 'Описание', descriptionPlaceholder: 'Что произошло, какой результат ожидается, когда возникла проблема', creating: 'Создаём…', create: 'Создать обращение' },
  en: { error: 'Could not create the request. Please try again.', title: 'Subject', titlePlaceholder: 'Briefly describe the task', category: 'Category', integration: 'Integration', infrastructure: 'Infrastructure', other: 'Other', priority: 'Priority', low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical', description: 'Description', descriptionPlaceholder: 'What happened, what result do you expect, and when did the issue occur?', creating: 'Creating…', create: 'Create request' },
};

export function NewRequestForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const text = copy[locale];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const data = (await response.json()) as { request?: { id: string } };
      if (!response.ok || !data.request) {
        setError(text.error);
        return;
      }
      router.push(localePath(locale, `/portal/requests/${encodeURIComponent(data.request.id)}`));
      router.refresh();
    } catch {
      setError(text.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 grid gap-5" aria-busy={pending}>
      <label><span className="mb-2 block text-sm font-black text-slate-700">{text.title}</span><input name="title" required minLength={3} maxLength={160} autoComplete="off" className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600" placeholder={text.titlePlaceholder} /></label>
      <div className="grid gap-5 md:grid-cols-2">
        <label><span className="mb-2 block text-sm font-black text-slate-700">{text.category}</span><select name="category" required className="w-full rounded-2xl border border-slate-200 px-4 py-3"><option value="1С">1C</option><option value="Интеграция">{text.integration}</option><option value="Agent+">Agent+</option><option value="AI">AI</option><option value="Инфраструктура">{text.infrastructure}</option><option value="Другое">{text.other}</option></select></label>
        <label><span className="mb-2 block text-sm font-black text-slate-700">{text.priority}</span><select name="priority" required defaultValue="NORMAL" className="w-full rounded-2xl border border-slate-200 px-4 py-3"><option value="LOW">{text.low}</option><option value="NORMAL">{text.normal}</option><option value="HIGH">{text.high}</option><option value="CRITICAL">{text.critical}</option></select></label>
      </div>
      <label><span className="mb-2 block text-sm font-black text-slate-700">{text.description}</span><textarea name="description" required minLength={10} maxLength={5_000} rows={7} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600" placeholder={text.descriptionPlaceholder} /></label>
      <div aria-live="polite">{error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}</div>
      <button type="submit" disabled={pending} className="w-full rounded-full bg-blue-600 px-7 py-3 font-black text-white disabled:opacity-60 sm:w-fit">{pending ? text.creating : text.create}</button>
    </form>
  );
}
