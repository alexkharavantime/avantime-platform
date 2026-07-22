'use client';
import { useState } from 'react';

export function KnowledgeArticleForm() {
  const [message, setMessage] = useState('');
  async function submit(formData: FormData) {
    setMessage('Сохраняем…');
    const response = await fetch('/api/admin/knowledge', { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error ?? 'Не удалось сохранить статью');
    setMessage('Черновик создан. Обновите страницу для публикации.');
  }
  return <form action={submit} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
    <h2 className="text-2xl font-black">Новая статья</h2>
    <div className="grid gap-4 md:grid-cols-2">
      <input required name="title" placeholder="Заголовок" className="rounded-2xl border border-slate-300 px-4 py-3" />
      <input required name="slug" placeholder="slug-na-latinice" pattern="[a-z0-9-]+" className="rounded-2xl border border-slate-300 px-4 py-3" />
      <input required name="category" placeholder="Категория" className="rounded-2xl border border-slate-300 px-4 py-3" />
      <input name="readingTime" placeholder="5 минут" className="rounded-2xl border border-slate-300 px-4 py-3" />
    </div>
    <input required name="summary" placeholder="Краткое описание" className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
    <input name="tags" placeholder="Теги через запятую" className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
    <textarea required name="body" rows={10} placeholder="Текст статьи. Пустая строка начинает новый раздел." className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
    <button className="rounded-full bg-blue-600 px-6 py-3 font-black text-white">Создать черновик</button>
    {message && <p className="text-sm font-bold text-slate-600">{message}</p>}
  </form>;
}
