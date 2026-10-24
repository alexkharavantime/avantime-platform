import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { listKnowledgeArticles } from '../../lib/knowledge-store';
import { getDocumentTenantContext } from '../../lib/document-model';
import { getDocumentServices } from '../../lib/document-services';
import { listPortalNotifications } from '../../lib/portal-notifications';
import { getValidatedPortalSession } from '../../lib/portal-session';
import { listRequests } from '../../lib/requests-store';
import { getLocale } from '../../lib/i18n-server';
import { localePath, type Locale } from '../../lib/i18n';
import { getSectionImage } from '../../lib/section-images';

const copy = {
  lv: { metadata: 'Klienta kabinets — Avantime', description: 'Pieprasījumi, dokumenti un Avantime zināšanu bāze.', eyebrow: 'Klienta kabinets', greeting: 'Labdien,', create: 'Izveidot pieprasījumu', find: 'Meklēt atbildi', overview: 'Kabineta pārskats', stats: ['atvērti pieprasījumi', 'dokumenti', 'zināšanu materiāli', 'nelasīti paziņojumi'], latestRequests: 'Jaunākie pieprasījumi', allRequests: 'Visi pieprasījumi', noRequests: 'Pieprasījumu vēl nav.', documents: 'Dokumenti', processing: 'Apstrādē', attention: 'Jāpārbauda', indexed: 'Indeksēti', total: 'Kopā', openDocuments: 'Atvērt dokumentus →', latestMessages: 'Jaunākās ziņas', noMessages: 'Jaunu ziņu nav.', statuses: { NEW: 'Jauns', OPEN: 'Atvērts', IN_PROGRESS: 'Procesā', WAITING_CUSTOMER: 'Nepieciešams precizējums', RESOLVED: 'Atrisināts', CLOSED: 'Slēgts' } },
  ru: { metadata: 'Кабинет клиента — Avantime', description: 'Обращения, документы и база знаний Avantime.', eyebrow: 'Кабинет клиента', greeting: 'Добрый день,', create: 'Создать обращение', find: 'Найти ответ', overview: 'Обзор кабинета', stats: ['открытых обращений', 'документов', 'материалов базы знаний', 'непрочитанных уведомлений'], latestRequests: 'Последние обращения', allRequests: 'Все обращения', noRequests: 'Обращений пока нет.', documents: 'Документы', processing: 'В обработке', attention: 'Нужна проверка', indexed: 'Проиндексировано', total: 'Всего', openDocuments: 'Открыть документы →', latestMessages: 'Последние сообщения', noMessages: 'Новых сообщений нет.', statuses: { NEW: 'Новое', OPEN: 'Открыто', IN_PROGRESS: 'В работе', WAITING_CUSTOMER: 'Нужно уточнение', RESOLVED: 'Решено', CLOSED: 'Закрыто' } },
  en: { metadata: 'Client portal — Avantime', description: 'Avantime requests, documents and knowledge base.', eyebrow: 'Client portal', greeting: 'Good day,', create: 'Create a request', find: 'Find an answer', overview: 'Portal overview', stats: ['open requests', 'documents', 'knowledge articles', 'unread notifications'], latestRequests: 'Recent requests', allRequests: 'All requests', noRequests: 'There are no requests yet.', documents: 'Documents', processing: 'Processing', attention: 'Needs review', indexed: 'Indexed', total: 'Total', openDocuments: 'Open documents →', latestMessages: 'Recent messages', noMessages: 'There are no new messages.', statuses: { NEW: 'New', OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_CUSTOMER: 'Needs clarification', RESOLVED: 'Resolved', CLOSED: 'Closed' } },
} satisfies Record<Locale, { metadata: string; description: string; eyebrow: string; greeting: string; create: string; find: string; overview: string; stats: string[]; latestRequests: string; allRequests: string; noRequests: string; documents: string; processing: string; attention: string; indexed: string; total: string; openDocuments: string; latestMessages: string; noMessages: string; statuses: Record<'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED', string> }>;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: copy[locale].metadata, description: copy[locale].description };
}

export default async function PortalPage() {
  const locale = await getLocale();
  const text = copy[locale];
  const cabinetImage = getSectionImage('client-cabinet', locale);
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login?returnTo=/portal'));

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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            {text.greeting} {session.name}
          </h1>
          <p className="mt-3 text-slate-600">{session.company}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={localePath(locale, '/portal/requests/new')}
              className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
            >
              {text.create}
            </Link>
            <Link
              href={localePath(locale, '/portal/knowledge')}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold"
            >
              {text.find}
            </Link>
          </div>
        </div>
        <div className="relative mx-auto aspect-[3/2] w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white lg:mx-0">
          <Image
            src={cabinetImage.src}
            alt={cabinetImage.alt}
            fill
            sizes="(max-width: 1023px) 100vw, 320px"
            className="object-contain"
          />
        </div>
      </div>

      <section aria-labelledby="portal-overview" className="mt-8">
        <h2 id="portal-overview" className="sr-only">
          {text.overview}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [openRequests.length, text.stats[0], '/portal/requests'],
            [documentSummary.total, text.stats[1], '/portal/documents'],
            [articles.length, text.stats[2], '/portal/knowledge'],
            [notifications.unread, text.stats[3], '/portal/notifications'],
          ].map(([value, label, href]) => (
            <Link
              key={label}
              href={localePath(locale, String(href))}
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
            <h2 className="text-xl font-black">{text.latestRequests}</h2>
            <Link href={localePath(locale, '/portal/requests')} className="text-sm font-bold text-blue-700">
              {text.allRequests}
            </Link>
          </div>
          {requests.length === 0 ? (
            <p className="p-6 text-slate-600">{text.noRequests}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.slice(0, 5).map((request) => (
                <Link
                  key={request.id}
                  href={localePath(locale, `/portal/requests/${encodeURIComponent(request.id)}`)}
                  className="grid gap-2 px-5 py-4 hover:bg-slate-50 sm:grid-cols-[7rem_1fr_auto] sm:items-center"
                >
                  <strong className="text-blue-700">{request.id}</strong>
                  <span className="font-bold">{request.title}</span>
                  <span className="text-sm text-slate-500">{text.statuses[request.status]}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-black">{text.documents}</h2>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            {[
              [text.processing, documentSummary.processing],
              [text.attention, documentSummary.attention],
              [text.indexed, documentSummary.indexed],
              [text.total, documentSummary.total],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-bold text-slate-500">{label}</dt>
                <dd className="mt-1 text-2xl font-black">{value}</dd>
              </div>
            ))}
          </dl>
          <Link href={localePath(locale, '/portal/documents')} className="mt-5 inline-block font-bold text-blue-700">
            {text.openDocuments}
          </Link>
        </section>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-black">{text.latestMessages}</h2>
        {latestMessages.length === 0 ? (
          <p className="mt-3 text-slate-600">{text.noMessages}</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {latestMessages.map((message) => (
              <li key={message.id} className="py-4">
                <Link
                  href={localePath(locale, `/portal/requests/${encodeURIComponent(message.requestId)}`)}
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
