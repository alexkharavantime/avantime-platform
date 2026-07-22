import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageShell } from '../../../../components/page-shell';
import { StatusControl } from '../../../../components/admin/status-control';
import { AdminReplyForm } from '../../../../components/admin/admin-reply-form';
import { getRequest } from '../../../../lib/requests-store';
import { findRelatedArticles } from '../../../../lib/knowledge-store';
import { getSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Обращение клиента — Avantime Admin' };
const priorityLabel = { LOW: 'Низкий', NORMAL: 'Обычный', HIGH: 'Высокий', CRITICAL: 'Критический' } as const;

export default async function AdminRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/portal/login');
  if (session.role !== 'ADMIN') redirect('/portal');

  const { id } = await params;
  const item = await getRequest(id);
  if (!item) notFound();
  const relatedArticles = await findRelatedArticles(`${item.category} ${item.title} ${item.description}`);

  return (
    <PageShell>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <Link href="/admin" className="font-bold text-blue-600">← Назад в административную панель</Link>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-8">
              <p className="text-sm font-black text-blue-600">{item.id}</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">{item.title}</h1>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {[
                  ['Категория', item.category],
                  ['Приоритет', priorityLabel[item.priority]],
                  ['Jira', item.jiraKey ?? 'Ожидает синхронизации'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="mt-2 font-bold text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {[
                  ['Компания', item.companyName ?? 'Demo Company'],
                  ['Контакт', item.requesterName ?? 'Demo Client'],
                  ['Email', item.requesterEmail ?? 'demo@avantime.lv'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="mt-2 break-words font-bold text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8">
                <h2 className="text-xl font-black">Описание</h2>
                <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">{item.description}</p>
              </div>
              <div className="mt-10 border-t border-slate-200 pt-8">
                <h2 className="text-xl font-black">История общения</h2>
                <div className="mt-5 space-y-4">
                  {item.messages.length ? item.messages.map((message) => (
                    <article key={message.id} className="rounded-2xl bg-slate-50 p-5">
                      <div className="flex flex-wrap justify-between gap-2">
                        <p className="font-black text-slate-900">{message.authorName}</p>
                        <time className="text-sm text-slate-500">{new Date(message.createdAt).toLocaleString('ru-RU')}</time>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">{message.body}</p>
                    </article>
                  )) : <p className="text-slate-500">Сообщений пока нет.</p>}
                </div>
              </div>
            </div>
            <div className="space-y-5">
              <StatusControl requestId={item.id} initialStatus={item.status} />
              <AdminReplyForm requestId={item.id} />
              <div className={`rounded-3xl p-6 text-white ${item.status !== 'RESOLVED' && new Date(item.dueAt).getTime() < Date.now() ? 'bg-red-700' : 'bg-slate-950'}`}>
                <p className="text-xs font-black uppercase tracking-widest text-cyan-200">SLA</p>
                <p className="mt-3 text-2xl font-black">{item.status !== 'RESOLVED' && new Date(item.dueAt).getTime() < Date.now() ? 'Срок нарушен' : 'В пределах срока'}</p>
                <p className="mt-3 text-sm leading-6 text-slate-200">Контрольный срок: {new Date(item.dueAt).toLocaleString('ru-RU')}</p>
              </div>
            </div>
          </div>

          {relatedArticles.length > 0 && <div className="mt-8 rounded-3xl border border-blue-100 bg-blue-50 p-7">
            <p className="text-xs font-black uppercase tracking-widest text-blue-600">Подсказка для ответа</p>
            <h2 className="mt-2 text-2xl font-black">Подходящие материалы базы знаний</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">{relatedArticles.map((article) => <Link key={article.id} href={`/knowledge/${article.slug}`} className="rounded-2xl bg-white p-5 transition hover:shadow-md"><p className="text-xs font-black text-blue-600">{article.category}</p><p className="mt-2 font-black">{article.title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{article.summary}</p></Link>)}</div>
          </div>}

          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-7">
            <h2 className="text-2xl font-black">Журнал действий</h2>
            <div className="mt-5 space-y-4">
              {item.audit.length ? item.audit.map((event) => (
                <div key={event.id} className="border-l-4 border-blue-500 pl-4">
                  <p className="font-bold">{event.action}</p>
                  <p className="text-sm text-slate-500">{event.actorName} · {new Date(event.createdAt).toLocaleString('ru-RU')}</p>
                </div>
              )) : <p className="text-slate-500">Действий пока нет.</p>}
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
