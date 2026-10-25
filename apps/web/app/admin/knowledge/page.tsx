import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '../../../components/page-shell';
import { KnowledgeArticleForm } from '../../../components/admin/knowledge-article-form';
import { getPlatformKnowledgeIndexDiagnostics } from '../../../lib/knowledge-indexing';
import { listKnowledgeArticles } from '../../../lib/knowledge-store';
import { getSession } from '../../../lib/session';
import { hasPlatformPermission } from '../../../lib/platform-authorization';
import { localePath, type Locale } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';

const copy = {
  lv: { back: '← Atpakaļ uz paneli', eyebrow: 'Saturs', title: 'Zināšanu bāze', description: 'Veidojiet un publicējiet instrukcijas, rakstus un atbildes klientiem.', status: { DRAFT: 'Melnraksts', REVIEW: 'Pārskatīšanā', PUBLISHED: 'Publicēts', ARCHIVED: 'Arhivēts' }, sourceType: 'Avota tips', lexical: 'Lexical indekss', embedding: 'Embedding statuss', chunks: 'Sadaļas', model: 'Embedding modelis/versija', indexed: 'Indeksēts', version: 'Avota/indeksa versija', quarantine: 'Karantīna/kļūda', view: 'Skatīt', publish: 'Publicēt', archive: 'Arhivēt', retry: 'Atkārtot indeksēšanu', reindex: 'Pārindeksēt' },
  ru: { back: '← Назад в панель', eyebrow: 'Контент', title: 'База знаний', description: 'Создание и публикация инструкций, статей и ответов для клиентов.', status: { DRAFT: 'Черновик', REVIEW: 'На проверке', PUBLISHED: 'Опубликована', ARCHIVED: 'Архив' }, sourceType: 'Тип источника', lexical: 'Лексический индекс', embedding: 'Статус embedding', chunks: 'Фрагменты', model: 'Модель/версия embedding', indexed: 'Индексировано', version: 'Версия источника/индекса', quarantine: 'Карантин/ошибка', view: 'Просмотр', publish: 'Опубликовать', archive: 'В архив', retry: 'Повторить индексацию', reindex: 'Переиндексировать' },
  en: { back: '← Back to dashboard', eyebrow: 'Content', title: 'Knowledge base', description: 'Create and publish instructions, articles and answers for clients.', status: { DRAFT: 'Draft', REVIEW: 'In review', PUBLISHED: 'Published', ARCHIVED: 'Archived' }, sourceType: 'Source type', lexical: 'Lexical index', embedding: 'Embedding status', chunks: 'Chunks', model: 'Embedding model/version', indexed: 'Indexed', version: 'Source/index version', quarantine: 'Quarantine/error', view: 'View', publish: 'Publish', archive: 'Archive', retry: 'Retry indexing', reindex: 'Reindex' },
} satisfies Record<Locale, { back: string; eyebrow: string; title: string; description: string; status: Record<'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED', string>; sourceType: string; lexical: string; embedding: string; chunks: string; model: string; indexed: string; version: string; quarantine: string; view: string; publish: string; archive: string; retry: string; reindex: string }>;

function formatDate(value: string | null | undefined, locale: Locale) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function AdminKnowledgePage() {
  const locale = await getLocale();
  const text = copy[locale];
  const session = await getSession();
  if (!session) redirect(localePath(locale, '/portal/login'));
  if (!(await hasPlatformPermission(session, 'platform.knowledge.view'))) redirect(localePath(locale, '/portal'));
  const articles = await listKnowledgeArticles({
    includeDrafts: true,
    includeQuarantined: true,
    audience: { kind: 'PLATFORM' },
  });
  const diagnostics = await getPlatformKnowledgeIndexDiagnostics(
    articles.map((article) => article.id),
  );
  return (
    <PageShell>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <Link href={localePath(locale, '/admin')} className="font-bold text-blue-600">
            {text.back}
          </Link>
          <div className="mt-6">
            <p className="eyebrow">{text.eyebrow}</p>
            <h1 className="mt-4 text-4xl font-black sm:text-6xl">{text.title}</h1>
            <p className="mt-4 text-lg text-slate-600">{text.description}</p>
          </div>
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
            <KnowledgeArticleForm locale={locale} />
            <div className="space-y-4">
              {articles.map((article) => (
                <article
                  key={article.id}
                  className="rounded-3xl border border-slate-200 bg-white p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-blue-600">
                        {article.category}
                      </p>
                      <h2 className="mt-2 text-xl font-black">{article.title}</h2>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">
                      {text.status[article.status]}
                    </span>
                  </div>
                  <p className="mt-3 text-slate-600">{article.summary}</p>
                  {(() => {
                    const diagnostic = diagnostics.get(article.id);
                    return (
                      <dl className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="font-bold text-slate-500">{text.sourceType}</dt>
                          <dd className="mt-1 font-black text-slate-900">{locale === 'ru' ? 'Статья' : locale === 'lv' ? 'Raksts' : 'Article'}</dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">{text.lexical}</dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {diagnostic?.searchStatus ?? 'NOT_INDEXED'}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">{text.embedding}</dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {diagnostic?.embeddingStatus ?? 'NOT_INDEXED'}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">{text.chunks}</dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {diagnostic?.chunkCount ?? 0}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">{text.model}</dt>
                          <dd className="mt-1 break-words font-black text-slate-900">
                            {diagnostic?.embeddingModel && diagnostic.embeddingVersion
                              ? `${diagnostic.embeddingModel} / ${diagnostic.embeddingVersion}`
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">{text.indexed}</dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {formatDate(diagnostic?.indexedAt, locale)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">{text.version}</dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {article.version} / {diagnostic?.indexedVersion ?? '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">{text.quarantine}</dt>
                          <dd className="mt-1 break-words font-black text-slate-900">
                            {article.quarantinedAt
                              ? `${locale === 'ru' ? 'КАРАНТИН' : locale === 'lv' ? 'KARANTĪNA' : 'QUARANTINED'} · ${formatDate(article.quarantinedAt, locale)}`
                              : (diagnostic?.indexingError ?? '—')}
                          </dd>
                        </div>
                      </dl>
                    );
                  })()}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      href={localePath(locale, `/knowledge/${article.slug}`)}
                      className="rounded-full border border-slate-300 px-4 py-2 text-sm font-black"
                    >
                      {text.view}
                    </Link>
                    {!article.quarantinedAt && article.status !== 'PUBLISHED' && (
                        <form action={`/api/admin/knowledge/${article.id}/status`} method="post">
                        <input type="hidden" name="status" value="PUBLISHED" />
                        <input type="hidden" name="expectedVersion" value={article.version} />
                        <button className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white">
                          {text.publish}
                        </button>
                      </form>
                    )}
                    {!article.quarantinedAt && article.status === 'PUBLISHED' && (
                      <form action={`/api/admin/knowledge/${article.id}/status`} method="post">
                        <input type="hidden" name="status" value="ARCHIVED" />
                        <input type="hidden" name="expectedVersion" value={article.version} />
                        <button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-black">
                          {text.archive}
                        </button>
                      </form>
                    )}
                    <form action={`/api/admin/knowledge/${article.id}/reindex`} method="post">
                      <input type="hidden" name="expectedVersion" value={article.version} />
                      <button className="rounded-full border border-blue-300 px-4 py-2 text-sm font-black text-blue-700">
                        {article.quarantinedAt ? text.retry : text.reindex}
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
