import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageShell } from '../../../../components/page-shell';
import { StatusControl } from '../../../../components/admin/status-control';
import { AdminReplyForm } from '../../../../components/admin/admin-reply-form';
import { getRequest } from '../../../../lib/requests-store';
import { findRelatedArticles } from '../../../../lib/knowledge-store';
import { getSession } from '../../../../lib/session';
import { localePath, type Locale } from '../../../../lib/i18n';
import { getLocale } from '../../../../lib/i18n-server';

const copy = {
  lv: { metadataTitle: 'Klienta pieprasījums — Avantime Admin', back: '← Atpakaļ uz paneli', category: 'Kategorija', priority: 'Prioritāte', priorities: { LOW: 'Zema', NORMAL: 'Parasta', HIGH: 'Augsta', CRITICAL: 'Kritiska' }, jira: 'Jira', waiting: 'Gaida sinhronizāciju', company: 'Uzņēmums', contact: 'Kontaktpersona', email: 'E-pasts', demoCompany: 'Demo uzņēmums', demoClient: 'Demo klients', description: 'Apraksts', history: 'Saziņas vēsture', noMessages: 'Ziņojumu vēl nav.', breached: 'Termiņš pārsniegts', onTime: 'Termiņā', due: 'Kontroles termiņš:', hint: 'Atbildes ieteikums', related: 'Saistītie zināšanu bāzes materiāli', activity: 'Darbību žurnāls', noActivity: 'Darbību vēl nav.' },
  ru: { metadataTitle: 'Обращение клиента — Avantime Admin', back: '← Назад в административную панель', category: 'Категория', priority: 'Приоритет', priorities: { LOW: 'Низкий', NORMAL: 'Обычный', HIGH: 'Высокий', CRITICAL: 'Критический' }, jira: 'Jira', waiting: 'Ожидает синхронизации', company: 'Компания', contact: 'Контакт', email: 'Электронная почта', demoCompany: 'Демо-компания', demoClient: 'Демо-клиент', description: 'Описание', history: 'История общения', noMessages: 'Сообщений пока нет.', breached: 'Срок нарушен', onTime: 'В пределах срока', due: 'Контрольный срок:', hint: 'Подсказка для ответа', related: 'Подходящие материалы базы знаний', activity: 'Журнал действий', noActivity: 'Действий пока нет.' },
  en: { metadataTitle: 'Customer request — Avantime Admin', back: '← Back to dashboard', category: 'Category', priority: 'Priority', priorities: { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High', CRITICAL: 'Critical' }, jira: 'Jira', waiting: 'Awaiting synchronization', company: 'Company', contact: 'Contact', email: 'Email', demoCompany: 'Demo company', demoClient: 'Demo client', description: 'Description', history: 'Conversation history', noMessages: 'There are no messages yet.', breached: 'Overdue', onTime: 'Within SLA', due: 'Due by:', hint: 'Reply suggestion', related: 'Related knowledge base materials', activity: 'Activity log', noActivity: 'There is no activity yet.' },
} satisfies Record<Locale, { metadataTitle: string; back: string; category: string; priority: string; priorities: Record<'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL', string>; jira: string; waiting: string; company: string; contact: string; email: string; demoCompany: string; demoClient: string; description: string; history: string; noMessages: string; breached: string; onTime: string; due: string; hint: string; related: string; activity: string; noActivity: string }>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: copy[await getLocale()].metadataTitle };
}

export default async function AdminRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await getLocale();
  const text = copy[locale];
  const session = await getSession();
  if (!session) redirect(localePath(locale, '/portal/login'));
  if (session.role !== 'ADMIN') redirect(localePath(locale, '/portal'));

  const { id } = await params;
  const item = await getRequest(id);
  if (!item) notFound();
  const relatedArticles = await findRelatedArticles(
    `${item.category} ${item.title} ${item.description}`,
  );

  return (
    <PageShell>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <Link href={localePath(locale, '/admin')} className="font-bold text-blue-600">
            {text.back}
          </Link>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-8">
              <p className="text-sm font-black text-blue-600">{item.id}</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">{item.title}</h1>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {[
                  [text.category, item.category],
                  [text.priority, text.priorities[item.priority]],
                  [text.jira, item.jiraKey ?? text.waiting],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                      {label}
                    </p>
                    <p className="mt-2 font-bold text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {[
                  [text.company, item.companyName ?? text.demoCompany],
                  [text.contact, item.requesterName ?? text.demoClient],
                  [text.email, item.requesterEmail ?? 'demo@avantime.lv'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                      {label}
                    </p>
                    <p className="mt-2 break-words font-bold text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8">
                <h2 className="text-xl font-black">{text.description}</h2>
                <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">
                  {item.description}
                </p>
              </div>
              <div className="mt-10 border-t border-slate-200 pt-8">
                <h2 className="text-xl font-black">{text.history}</h2>
                <div className="mt-5 space-y-4">
                  {item.messages.length ? (
                    item.messages.map((message) => (
                      <article key={message.id} className="rounded-2xl bg-slate-50 p-5">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-black text-slate-900">{message.authorName}</p>
                          <time className="text-sm text-slate-500">
                            {new Date(message.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB')}
                          </time>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">
                          {message.body}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="text-slate-500">{text.noMessages}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-5">
              <StatusControl requestId={item.id} initialStatus={item.status} locale={locale} />
              <AdminReplyForm requestId={item.id} locale={locale} />
              <div
                className={`rounded-3xl p-6 text-white ${item.status !== 'RESOLVED' && new Date(item.dueAt).getTime() < Date.now() ? 'bg-red-700' : 'bg-slate-950'}`}
              >
                <p className="text-xs font-black uppercase tracking-widest text-cyan-200">SLA</p>
                <p className="mt-3 text-2xl font-black">
                  {item.status !== 'RESOLVED' && new Date(item.dueAt).getTime() < Date.now()
                    ? text.breached
                    : text.onTime}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  {text.due} {new Date(item.dueAt).toLocaleString(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB')}
                </p>
              </div>
            </div>
          </div>

          {relatedArticles.length > 0 && (
            <div className="mt-8 rounded-3xl border border-blue-100 bg-blue-50 p-7">
              <p className="text-xs font-black uppercase tracking-widest text-blue-600">
                {text.hint}
              </p>
              <h2 className="mt-2 text-2xl font-black">{text.related}</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {relatedArticles.map((article) => (
                  <Link
                    key={article.id}
                    href={localePath(locale, `/knowledge/${article.slug}`)}
                    className="rounded-2xl bg-white p-5 transition hover:shadow-md"
                  >
                    <p className="text-xs font-black text-blue-600">{article.category}</p>
                    <p className="mt-2 font-black">{article.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{article.summary}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-7">
            <h2 className="text-2xl font-black">{text.activity}</h2>
            <div className="mt-5 space-y-4">
              {item.audit.length ? (
                item.audit.map((event) => (
                  <div key={event.id} className="border-l-4 border-blue-500 pl-4">
                    <p className="font-bold">{event.action}</p>
                    <p className="text-sm text-slate-500">
                      {event.actorName} · {new Date(event.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB')}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-slate-500">{text.noActivity}</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
