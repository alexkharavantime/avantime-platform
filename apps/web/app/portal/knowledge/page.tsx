import Link from 'next/link';
import { redirect } from 'next/navigation';

import { KnowledgeAsk } from '../../../components/knowledge-ask';
import { PortalDocumentSearch } from '../../../components/portal/document-search';
import { listKnowledgeArticles } from '../../../lib/knowledge-store';
import { getValidatedPortalSession } from '../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../lib/organization-permissions';

export default async function PortalKnowledgePage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/portal/knowledge');
  if (!hasOrganizationPermission(session, 'knowledge.view')) redirect('/portal');
  const articles = await listKnowledgeArticles();
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
      <p className="eyebrow">Знания компании</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">База знаний и AI</h1>
      <p className="mt-3 max-w-3xl text-slate-600">
        Ищите по доступным документам и получайте ответы со ссылками на проверяемые источники.
      </p>
      <div className="mt-8">
        <PortalDocumentSearch />
      </div>
      <KnowledgeAsk />
      <section className="mt-8">
        <h2 className="text-2xl font-black">Материалы Avantime</h2>
        {articles.length === 0 ? (
          <p className="mt-4 text-slate-600">Опубликованных материалов пока нет.</p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/knowledge/${encodeURIComponent(article.slug)}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-300"
              >
                <p className="text-xs font-black uppercase tracking-widest text-blue-700">
                  {article.category}
                </p>
                <h3 className="mt-3 text-lg font-black">{article.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{article.summary}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
