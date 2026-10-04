'use client';
import { useState } from 'react';
import type { Locale } from '../../lib/i18n';

const copy = {
  lv: { saving: 'Saglabā…', failed: 'Neizdevās saglabāt rakstu.', saved: 'Melnraksts izveidots. Atsvaidziniet lapu, lai publicētu.', title: 'Jauns raksts', headline: 'Virsraksts', category: 'Kategorija', readingTime: '5 minūtes', summary: 'Īss apraksts', tags: 'Tagi, atdalīti ar komatiem', body: 'Raksta teksts. Tukša rinda sāk jaunu sadaļu.', submit: 'Izveidot melnrakstu' },
  ru: { saving: 'Сохраняем…', failed: 'Не удалось сохранить статью.', saved: 'Черновик создан. Обновите страницу для публикации.', title: 'Новая статья', headline: 'Заголовок', category: 'Категория', readingTime: '5 минут', summary: 'Краткое описание', tags: 'Теги через запятую', body: 'Текст статьи. Пустая строка начинает новый раздел.', submit: 'Создать черновик' },
  en: { saving: 'Saving…', failed: 'Could not save the article.', saved: 'Draft created. Refresh the page to publish it.', title: 'New article', headline: 'Title', category: 'Category', readingTime: '5 minutes', summary: 'Short description', tags: 'Comma-separated tags', body: 'Article text. A blank line starts a new section.', submit: 'Create draft' },
} satisfies Record<Locale, Record<string, string>>;

export function KnowledgeArticleForm({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const [message, setMessage] = useState('');
  async function submit(formData: FormData) {
    setMessage(text.saving);
    const response = await fetch('/api/admin/knowledge', { method: 'POST', body: formData });
    if (!response.ok) return setMessage(text.failed);
    setMessage(text.saved);
  }
  return (
    <form action={submit} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-black">{text.title}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <input
          required
          name="title"
          placeholder={text.headline}
          className="rounded-2xl border border-slate-300 px-4 py-3"
        />
        <input
          required
          name="slug"
          placeholder="slug-na-latinice"
          pattern="[a-z0-9-]+"
          className="rounded-2xl border border-slate-300 px-4 py-3"
        />
        <input
          required
          name="category"
          placeholder={text.category}
          className="rounded-2xl border border-slate-300 px-4 py-3"
        />
        <input
          name="readingTime"
          placeholder={text.readingTime}
          className="rounded-2xl border border-slate-300 px-4 py-3"
        />
      </div>
      <input
        required
        name="summary"
        placeholder={text.summary}
        className="w-full rounded-2xl border border-slate-300 px-4 py-3"
      />
      <input
        name="tags"
        placeholder={text.tags}
        className="w-full rounded-2xl border border-slate-300 px-4 py-3"
      />
      <textarea
        required
        name="body"
        rows={10}
        placeholder={text.body}
        className="w-full rounded-2xl border border-slate-300 px-4 py-3"
      />
      <button className="rounded-full bg-blue-600 px-6 py-3 font-black text-white">
        {text.submit}
      </button>
      {message && <p className="text-sm font-bold text-slate-600">{message}</p>}
    </form>
  );
}
