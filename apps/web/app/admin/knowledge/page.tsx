import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '../../../components/page-shell';
import { KnowledgeArticleForm } from '../../../components/admin/knowledge-article-form';
import { listKnowledgeArticles } from '../../../lib/knowledge-store';
import { getSession } from '../../../lib/session';

const statusLabels = { DRAFT: 'Черновик', PUBLISHED: 'Опубликована', ARCHIVED: 'Архив' } as const;
export default async function AdminKnowledgePage() {
  const session = await getSession();
  if (!session) redirect('/portal/login');
  if (session.role !== 'ADMIN') redirect('/portal');
  const articles = await listKnowledgeArticles({ includeDrafts: true });
  return <PageShell><section className="bg-slate-50 py-16"><div className="mx-auto max-w-6xl px-6">
    <Link href="/admin" className="font-bold text-blue-600">← Административная панель</Link>
    <div className="mt-6"><p className="eyebrow">Контент</p><h1 className="mt-4 text-4xl font-black sm:text-6xl">База знаний</h1><p className="mt-4 text-lg text-slate-600">Создание и публикация инструкций, статей и ответов для клиентов.</p></div>
    <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <KnowledgeArticleForm />
      <div className="space-y-4">{articles.map((article) => <article key={article.id} className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-blue-600">{article.category}</p><h2 className="mt-2 text-xl font-black">{article.title}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{statusLabels[article.status]}</span></div>
        <p className="mt-3 text-slate-600">{article.summary}</p><div className="mt-5 flex flex-wrap gap-2"><Link href={`/knowledge/${article.slug}`} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-black">Просмотр</Link>{article.status !== 'PUBLISHED' && <form action={`/api/admin/knowledge/${article.id}/status`} method="post"><input type="hidden" name="status" value="PUBLISHED"/><button className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white">Опубликовать</button></form>}{article.status === 'PUBLISHED' && <form action={`/api/admin/knowledge/${article.id}/status`} method="post"><input type="hidden" name="status" value="ARCHIVED"/><button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-black">В архив</button></form>}</div>
      </article>)}</div>
    </div>
  </div></section></PageShell>;
}
