import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageShell } from '../../../../components/page-shell';
import { AttachmentPanel } from '../../../../components/portal/attachment-panel';
import { RequestMessageForm } from '../../../../components/portal/request-message-form';
import { getRequest } from '../../../../lib/requests-store';
import { getSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Обращение — Avantime' };
const statusLabel = { NEW: 'Новое', IN_PROGRESS: 'В работе', WAITING_CUSTOMER: 'Нужно уточнение', RESOLVED: 'Решено' } as const;
const priorityLabel = { LOW: 'Низкий', NORMAL: 'Обычный', HIGH: 'Высокий', CRITICAL: 'Критический' } as const;

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) redirect('/portal/login');
  const { id } = await params;
  const item = await getRequest(id);
  if (!item) notFound();

  return <PageShell><section className="bg-slate-50 py-16"><div className="mx-auto max-w-4xl px-6">
    <Link href="/portal" className="font-bold text-blue-600">← Назад в кабинет</Link>
    <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-8">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-black text-blue-600">{item.id}</p><h1 className="mt-2 text-4xl font-black tracking-tight">{item.title}</h1></div><span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">{statusLabel[item.status]}</span></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">{[['Категория',item.category],['Приоритет',priorityLabel[item.priority]],['Jira',item.jiraKey ?? 'Ожидает синхронизации']].map(([label,value])=><div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-2 font-bold text-slate-800">{value}</p></div>)}</div>
      <div className="mt-8"><h2 className="text-xl font-black">Описание</h2><p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">{item.description}</p></div>
      <div className="mt-10 border-t border-slate-200 pt-8"><h2 className="text-xl font-black">История общения</h2>{item.messages.length ? <div className="mt-5 space-y-4">{item.messages.map((message)=><article key={message.id} className="rounded-2xl bg-slate-50 p-5"><div className="flex flex-wrap justify-between gap-2"><p className="font-black text-slate-900">{message.authorName}</p><time className="text-sm text-slate-500">{new Date(message.createdAt).toLocaleString('ru-RU')}</time></div><p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">{message.body}</p></article>)}</div> : <p className="mt-3 text-slate-500">Сообщений пока нет.</p>}<RequestMessageForm requestId={item.id} /></div>
      <div className="mt-8"><AttachmentPanel requestId={item.id} /></div>
      <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-5"><p className="font-black text-blue-900">Интеграция с Jira</p><p className="mt-2 text-sm leading-6 text-blue-800">При заполненных переменных окружения новый запрос можно передавать в Jira через подготовленный адаптер. Без Jira кабинет продолжает работать автономно.</p></div>
    </div>
  </div></section></PageShell>;
}
