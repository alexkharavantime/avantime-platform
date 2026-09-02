import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '../../../components/page-shell';
import { KnowledgeArticleForm } from '../../../components/admin/knowledge-article-form';
import { getPlatformKnowledgeIndexDiagnostics } from '../../../lib/knowledge-indexing';
import { listKnowledgeArticles } from '../../../lib/knowledge-store';
import { getSession } from '../../../lib/session';
import { hasPlatformPermission } from '../../../lib/platform-authorization';

const statusLabels = {
  DRAFT: 'Черновик',
  REVIEW: 'На проверке',
  PUBLISHED: 'Опубликована',
  ARCHIVED: 'Архив',
} as const;

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function AdminKnowledgePage() {
  const session = await getSession();
  if (!session) redirect('/portal/login');
  if (!(await hasPlatformPermission(session, 'platform.knowledge.view'))) redirect('/portal');
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
          <Link href="/admin" className="font-bold text-blue-600">
            ← Административная панель
          </Link>
          <div className="mt-6">
            <p className="eyebrow">Контент</p>
            <h1 className="mt-4 text-4xl font-black sm:text-6xl">База знаний</h1>
            <p className="mt-4 text-lg text-slate-600">
              Создание и публикация инструкций, статей и ответов для клиентов.
            </p>
          </div>
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
            <KnowledgeArticleForm />
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
                      {statusLabels[article.status]}
                    </span>
                  </div>
                  <p className="mt-3 text-slate-600">{article.summary}</p>
                  {(() => {
                    const diagnostic = diagnostics.get(article.id);
                    return (
                      <dl className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="font-bold text-slate-500">Тип источника</dt>
                          <dd className="mt-1 font-black text-slate-900">ARTICLE</dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">Lexical index</dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {diagnostic?.searchStatus ?? 'NOT_INDEXED'}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">Embedding status</dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {diagnostic?.embeddingStatus ?? 'NOT_INDEXED'}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">Chunks</dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {diagnostic?.chunkCount ?? 0}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">Embedding model/version</dt>
                          <dd className="mt-1 break-words font-black text-slate-900">
                            {diagnostic?.embeddingModel && diagnostic.embeddingVersion
                              ? `${diagnostic.embeddingModel} / ${diagnostic.embeddingVersion}`
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">Индексировано</dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {formatDate(diagnostic?.indexedAt)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">Версия source/index</dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {article.version} / {diagnostic?.indexedVersion ?? '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-500">Quarantine / ошибка</dt>
                          <dd className="mt-1 break-words font-black text-slate-900">
                            {article.quarantinedAt
                              ? `QUARANTINED · ${formatDate(article.quarantinedAt)}`
                              : (diagnostic?.indexingError ?? '—')}
                          </dd>
                        </div>
                      </dl>
                    );
                  })()}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      href={`/knowledge/${article.slug}`}
                      className="rounded-full border border-slate-300 px-4 py-2 text-sm font-black"
                    >
                      Просмотр
                    </Link>
                    {!article.quarantinedAt && article.status !== 'PUBLISHED' && (
                      <form action={`/api/admin/knowledge/${article.id}/status`} method="post">
                        <input type="hidden" name="status" value="PUBLISHED" />
                        <input type="hidden" name="expectedVersion" value={article.version} />
                        <button className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white">
                          Опубликовать
                        </button>
                      </form>
                    )}
                    {!article.quarantinedAt && article.status === 'PUBLISHED' && (
                      <form action={`/api/admin/knowledge/${article.id}/status`} method="post">
                        <input type="hidden" name="status" value="ARCHIVED" />
                        <input type="hidden" name="expectedVersion" value={article.version} />
                        <button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-black">
                          В архив
                        </button>
                      </form>
                    )}
                    <form action={`/api/admin/knowledge/${article.id}/reindex`} method="post">
                      <input type="hidden" name="expectedVersion" value={article.version} />
                      <button className="rounded-full border border-blue-300 px-4 py-2 text-sm font-black text-blue-700">
                        {article.quarantinedAt ? 'Повторить индексацию' : 'Переиндексировать'}
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
