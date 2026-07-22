import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '../../../components/page-shell';
import { listRequests } from '../../../lib/requests-store';
import { getSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Уведомления — Avantime Admin' };

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/portal/login');
  if (session.role !== 'ADMIN') redirect('/portal');

  const now = Date.now();
  const requests = await listRequests();
  const alerts = requests
    .filter((item) => item.status !== 'RESOLVED' && (new Date(item.dueAt).getTime() < now || item.priority === 'CRITICAL'))
    .map((item) => ({
      ...item,
      overdue: new Date(item.dueAt).getTime() < now,
    }));

  return (
    <PageShell>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <Link href="/admin" className="font-bold text-blue-600">← Назад в панель</Link>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-black text-blue-600">Контроль сервиса</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">Уведомления и эскалации</h1>
            </div>
            <span className="rounded-full bg-red-100 px-4 py-2 font-black text-red-700">{alerts.length} требуют внимания</span>
          </div>

          <div className="mt-8 space-y-4">
            {alerts.length ? alerts.map((item) => (
              <Link key={item.id} href={`/admin/requests/${item.id}`} className="block rounded-3xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-black text-blue-600">{item.id}</p>
                    <h2 className="mt-1 text-xl font-black">{item.title}</h2>
                    <p className="mt-2 text-sm text-slate-500">{item.companyName ?? 'Demo Company'} · {item.category}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${item.overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {item.overdue ? 'SLA просрочен' : 'Критический приоритет'}
                  </span>
                </div>
                <p className="mt-4 text-sm font-bold text-slate-600">Контрольный срок: {new Date(item.dueAt).toLocaleString('ru-RU')}</p>
              </Link>
            )) : (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center">
                <p className="text-2xl font-black text-emerald-800">Все обращения под контролем</p>
                <p className="mt-2 text-emerald-700">Просроченных и критических обращений нет.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
