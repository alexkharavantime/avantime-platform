import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '../../components/page-shell';
import { listKnowledgeArticles } from '../../lib/knowledge-store';

export const metadata: Metadata = { title: 'База знаний — Avantime', description: 'Практические материалы об автоматизации, 1С, AI и интеграциях.' };
export const dynamic = 'force-dynamic';

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const params = await searchParams;
  const all = await listKnowledgeArticles();
  const categories = [...new Set(all.map((article) => article.category))].sort();
  const articles = await listKnowledgeArticles({ query: params.q, category: params.category });
  return <PageShell>
    <section className="border-b border-slate-200 bg-slate-50"><div className="mx-auto max-w-7xl px-6 py-20 sm:py-28"><p className="eyebrow">База знаний</p><h1 className="mt-5 max-w-4xl text-5xl font-black tracking-[-0.045em] sm:text-7xl">Практика автоматизации без лишней теории</h1><p className="mt-7 max-w-3xl text-xl leading-9 text-slate-600">Материалы для руководителей и специалистов: архитектура, внедрение, риски и рабочие подходы.</p></div></section>
    <section className="py-16"><div className="mx-auto max-w-7xl px-6">
      <form className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-[1fr_260px_auto]">
        <input name="q" defaultValue={params.q} placeholder="Поиск по статьям, темам и тегам" className="rounded-2xl border border-slate-300 px-4 py-3" />
        <select name="category" defaultValue={params.category ?? ''} className="rounded-2xl border border-slate-300 px-4 py-3"><option value="">Все категории</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
        <button className="rounded-2xl bg-blue-600 px-6 py-3 font-black text-white">Найти</button>
      </form>
      <p className="mt-6 text-sm font-bold text-slate-500">Найдено материалов: {articles.length}</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">{articles.map((article) => <Link key={article.slug} href={`/knowledge/${article.slug}`} className="group rounded-3xl border border-slate-200 p-8 transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl"><p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">{article.category}</p><h2 className="mt-6 text-3xl font-black leading-tight">{article.title}</h2><p className="mt-5 leading-7 text-slate-600">{article.summary}</p><div className="mt-6 flex flex-wrap gap-2">{article.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{tag}</span>)}</div><div className="mt-8 flex items-center justify-between text-sm font-bold"><span className="text-slate-500">{article.readingTime}</span><span className="text-blue-600">Читать →</span></div></Link>)}</div>
      {!articles.length && <div className="mt-8 rounded-3xl bg-slate-50 p-10 text-center"><h2 className="text-2xl font-black">Материалы не найдены</h2><p className="mt-3 text-slate-600">Измените поисковый запрос или выберите другую категорию.</p></div>}
    </div></section>
  </PageShell>;
}
