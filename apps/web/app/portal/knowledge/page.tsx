import Link from 'next/link';
import { redirect } from 'next/navigation';

import { KnowledgeAsk } from '../../../components/knowledge-ask';
import { PortalDocumentSearch } from '../../../components/portal/document-search';
import { listKnowledgeArticles } from '../../../lib/knowledge-store';
import { getValidatedPortalSession } from '../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../lib/organization-permissions';
import { localePath, type Locale } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';

const copy = {
  lv: { eyebrow: 'Uzņēmuma zināšanas', title: 'Zināšanu bāze un AI', description: 'Meklējiet pieejamos dokumentos un saņemiet atbildes ar pārbaudāmu avotu saitēm.', articles: 'Avantime materiāli', empty: 'Publicētu materiālu vēl nav.' },
  ru: { eyebrow: 'Знания компании', title: 'База знаний и AI', description: 'Ищите по доступным документам и получайте ответы со ссылками на проверяемые источники.', articles: 'Материалы Avantime', empty: 'Опубликованных материалов пока нет.' },
  en: { eyebrow: 'Company knowledge', title: 'Knowledge base and AI', description: 'Search available documents and get answers linked to verifiable sources.', articles: 'Avantime materials', empty: 'There are no published materials yet.' },
} satisfies Record<Locale, { eyebrow: string; title: string; description: string; articles: string; empty: string }>;

export default async function PortalKnowledgePage() {
  const locale = await getLocale();
  const text = copy[locale];
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login?returnTo=/portal/knowledge'));
  if (!hasOrganizationPermission(session, 'knowledge.view')) redirect(localePath(locale, '/portal'));
  const articles = await listKnowledgeArticles({
    audience: { kind: 'ORGANIZATION', companyId: session.companyId! },
  });
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
      <p className="eyebrow">{text.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">{text.title}</h1>
      <p className="mt-3 max-w-3xl text-slate-600">{text.description}</p>
      <div className="mt-8">
        <PortalDocumentSearch locale={locale} />
      </div>
      <KnowledgeAsk locale={locale} />
      <section className="mt-8">
        <h2 className="text-2xl font-black">{text.articles}</h2>
        {articles.length === 0 ? (
          <p className="mt-4 text-slate-600">{text.empty}</p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={localePath(locale, `/portal/knowledge/${encodeURIComponent(article.slug)}`)}
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
