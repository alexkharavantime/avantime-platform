import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { PageShell } from '../../components/page-shell';
import { listKnowledgeArticles } from '../../lib/knowledge-store';
import { getLocale } from '../../lib/i18n-server';
import { localePath } from '../../lib/i18n';
import { getSectionImage } from '../../lib/section-images';

const pageCopy = {
  lv: { eyebrow: 'Zināšanu bāze', title: 'Automatizācijas prakse bez liekas teorijas', description: 'Materiāli vadītājiem un speciālistiem par arhitektūru, ieviešanu, riskiem un praktisku pieeju.', search: 'Meklēt rakstos, tēmās un tagos', all: 'Visas kategorijas', find: 'Meklēt', found: 'Atrasti materiāli', empty: 'Materiāli nav atrasti', emptyText: 'Mainiet meklēšanas vaicājumu vai izvēlieties citu kategoriju.', read: 'Lasīt →' },
  ru: { eyebrow: 'База знаний', title: 'Практика автоматизации без лишней теории', description: 'Материалы для руководителей и специалистов: архитектура, внедрение, риски и рабочие подходы.', search: 'Поиск по статьям, темам и тегам', all: 'Все категории', find: 'Найти', found: 'Найдено материалов', empty: 'Материалы не найдены', emptyText: 'Измените поисковый запрос или выберите другую категорию.', read: 'Читать →' },
  en: { eyebrow: 'Knowledge base', title: 'Automation practice without unnecessary theory', description: 'Materials for managers and specialists: architecture, implementation, risks and practical approaches.', search: 'Search articles, topics and tags', all: 'All categories', find: 'Search', found: 'Materials found', empty: 'No materials found', emptyText: 'Change your search query or choose another category.', read: 'Read →' },
} as const;

export const metadata: Metadata = {
  title: 'База знаний — Avantime',
  description: 'Практические материалы об автоматизации, 1С, AI и интеграциях.',
};
export const dynamic = 'force-dynamic';

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const copy = pageCopy[locale];
  const knowledgeImage = getSectionImage('knowledge', locale);
  const all = await listKnowledgeArticles();
  const categories = [...new Set(all.map((article) => article.category))].sort();
  const articles = await listKnowledgeArticles({ query: params.q, category: params.category });
  return (
    <PageShell>
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-black tracking-[-0.045em] sm:text-7xl">{copy.title}</h1>
          <p className="mt-7 max-w-3xl text-xl leading-9 text-slate-600">{copy.description}</p>
        </div>
      </section>
      <section className="border-b border-slate-200 bg-white py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-6">
          <Image
            src={knowledgeImage.src}
            alt={knowledgeImage.alt}
            width={1774}
            height={887}
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="h-auto w-full rounded-3xl border border-slate-200 object-contain shadow-xl shadow-slate-950/10"
          />
        </div>
      </section>
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-6">
          <form className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-[1fr_260px_auto]">
            <input
              name="q"
              defaultValue={params.q}
              placeholder={copy.search}
              className="rounded-2xl border border-slate-300 px-4 py-3"
            />
            <select
              name="category"
              defaultValue={params.category ?? ''}
              className="rounded-2xl border border-slate-300 px-4 py-3"
            >
              <option value="">{copy.all}</option>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            <button className="rounded-2xl bg-blue-600 px-6 py-3 font-black text-white">
              {copy.find}
            </button>
          </form>
          <p className="mt-6 text-sm font-bold text-slate-500">
            {copy.found}: {articles.length}
          </p>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {articles.map((article) => (
              <Link
                key={article.slug}
                href={localePath(locale, `/knowledge/${article.slug}`)}
                className="group rounded-3xl border border-slate-200 p-8 transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl"
              >
                <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
                  {article.category}
                </p>
                <h2 className="mt-6 text-3xl font-black leading-tight">{article.title}</h2>
                <p className="mt-5 leading-7 text-slate-600">{article.summary}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {article.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-8 flex items-center justify-between text-sm font-bold">
                  <span className="text-slate-500">{article.readingTime}</span>
                  <span className="text-blue-600">{copy.read}</span>
                </div>
              </Link>
            ))}
          </div>
          {!articles.length && (
            <div className="mt-8 rounded-3xl bg-slate-50 p-10 text-center">
              <h2 className="text-2xl font-black">{copy.empty}</h2>
              <p className="mt-3 text-slate-600">{copy.emptyText}</p>
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
