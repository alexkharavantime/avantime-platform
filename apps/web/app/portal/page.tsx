import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { listKnowledgeArticles } from '../../lib/knowledge-store';
import { getDocumentTenantContext } from '../../lib/document-model';
import { getDocumentServices } from '../../lib/document-services';
import { listPortalNotifications } from '../../lib/portal-notifications';
import { getValidatedPortalSession } from '../../lib/portal-session';
import { listRequests } from '../../lib/requests-store';

export const metadata: Metadata = {
  title: 'Кабинет клиента — Avantime',
  description: 'Обращения, документы и база знаний Avantime.',
};

const requestStatus = {
  NEW: 'Новое',
  IN_PROGRESS: 'В работе',
  WAITING_CUSTOMER: 'Нужно уточнение',
  RESOLVED: 'Решено',
} as const;

export default async function PortalPage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/portal');

  const [requests, articles, notifications] = await Promise.all([
    listRequests(session),
    listKnowledgeArticles(),
    listPortalNotifications(session),
  ]);
  let documentSummary = {
    total: 0,
    processing: 0,
    attention: 0,
    indexed: 0,
  };
  try {
    const documents = await getDocumentServices().metadata.list(getDocumentTenantContext(session));
    documentSummary = {
      total: documents.length,
      processing: documents.filter((item) =>
        ['UPLOADED', 'QUEUED', 'PROCESSING'].includes(item.status),
      ).length,
      attention: documents.filter(
        (item) =>
          item.status === 'FAILED' || item.status === 'QUARANTINED' || item.requiresManualReview,
      ).length,
      indexed: documents.filter((item) => item.embeddingStatus === 'COMPLETED').length,
    };
  } catch {
    // The dashboard remains usable when document status is temporarily unavailable.
  }

  const openRequests = requests.filter((item) => item.status !== 'RESOLVED');
  const latestMessages = requests
    .flatMap((request) =>
      request.messages.map((message) => ({ ...message, requestId: request.id })),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Кабинет клиента</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            Добрый день, {session.name}
          </h1>
          <p className="mt-3 text-slate-600">{session.company}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/portal/requests/new"
            className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
          >
            Создать обращение
          </Link>
          <Link
            href="/portal/knowledge"
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold"
          >
            Найти ответ
          </Link>
        </div>
      </div>

      <section aria-labelledby="portal-overview" className="mt-8">
        <h2 id="portal-overview" className="sr-only">
          Обзор кабинета
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [openRequests.length, 'открытых обращений', '/portal/requests'],
            [documentSummary.total, 'документов', '/portal/documents'],
            [articles.length, 'материалов знаний', '/portal/knowledge'],
            [notifications.unread, 'непрочитанных уведомлений', '/portal/notifications'],
          ].map(([value, label, href]) => (
            <Link
              key={label}
              href={String(href)}
              className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-300"
            >
              <strong className="block text-3xl font-black text-blue-700">{value}</strong>
              <span className="mt-1 block text-sm font-bold text-slate-600">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-xl font-black">Последние обращения</h2>
            <Link href="/portal/requests" className="text-sm font-bold text-blue-700">
              Все обращения
            </Link>
          </div>
          {requests.length === 0 ? (
            <p className="p-6 text-slate-600">Обращений пока нет.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.slice(0, 5).map((request) => (
                <Link
                  key={request.id}
                  href={`/portal/requests/${encodeURIComponent(request.id)}`}
                  className="grid gap-2 px-5 py-4 hover:bg-slate-50 sm:grid-cols-[7rem_1fr_auto] sm:items-center"
                >
                  <strong className="text-blue-700">{request.id}</strong>
                  <span className="font-bold">{request.title}</span>
                  <span className="text-sm text-slate-500">{requestStatus[request.status]}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-black">Документы</h2>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            {[
              ['В обработке', documentSummary.processing],
              ['Нужна проверка', documentSummary.attention],
              ['Проиндексировано', documentSummary.indexed],
              ['Всего', documentSummary.total],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-bold text-slate-500">{label}</dt>
                <dd className="mt-1 text-2xl font-black">{value}</dd>
              </div>
            ))}
          </dl>
          <Link href="/portal/documents" className="mt-5 inline-block font-bold text-blue-700">
            Открыть документы →
          </Link>
        </section>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-black">Последние сообщения</h2>
        {latestMessages.length === 0 ? (
          <p className="mt-3 text-slate-600">Новых сообщений нет.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {latestMessages.map((message) => (
              <li key={message.id} className="py-4">
                <Link
                  href={`/portal/requests/${encodeURIComponent(message.requestId)}`}
                  className="font-bold text-blue-700"
                >
                  {message.requestId}
                </Link>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{message.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
