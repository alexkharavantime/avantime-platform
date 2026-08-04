import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '../../components/page-shell';
import { listRequests } from '../../lib/requests-store';
import { getSession } from '../../lib/session';

export const metadata: Metadata = { title: 'Администрирование — Avantime' };

const labels = {
  NEW: 'Новое',
  OPEN: 'Открыто',
  IN_PROGRESS: 'В работе',
  WAITING_CUSTOMER: 'Нужно уточнение',
  RESOLVED: 'Решено',
  CLOSED: 'Закрыто',
} as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; priority?: string; sla?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/portal/login');
  if (session.role !== 'ADMIN') redirect('/portal');

  const params = await searchParams;
  const allRequests = await listRequests();
  const now = Date.now();
  const requests = allRequests.filter((item) => {
    const query = (params.q ?? '').toLowerCase();
    const matchesQuery =
      !query || `${item.id} ${item.title} ${item.category}`.toLowerCase().includes(query);
    const matchesStatus = !params.status || item.status === params.status;
    const matchesPriority = !params.priority || item.priority === params.priority;
    const overdue = item.status !== 'RESOLVED' && new Date(item.dueAt).getTime() < now;
    const matchesSla = params.sla !== 'overdue' || overdue;
    return matchesQuery && matchesStatus && matchesPriority && matchesSla;
  });
  const stats = {
    total: allRequests.length,
    open: allRequests.filter((item) => item.status !== 'RESOLVED').length,
    waiting: allRequests.filter((item) => item.status === 'WAITING_CUSTOMER').length,
    critical: allRequests.filter((item) => item.priority === 'CRITICAL').length,
  };

  return (
    <PageShell>
      <section className="bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow">Административная панель</p>
              <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-6xl">
                Управление клиентским сервисом
              </h1>
              <p className="mt-5 text-lg text-slate-600">
                {session.name} · {session.email}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/knowledge"
                className="rounded-full border border-slate-300 px-5 py-3 font-black text-slate-700"
              >
                Статьи
              </Link>
              <Link
                href="/admin/documents"
                className="rounded-full border border-slate-300 px-5 py-3 font-black text-slate-700"
              >
                Документы
              </Link>
              <Link
                href="/admin/email-queue"
                className="rounded-full border border-slate-300 px-5 py-3 font-black text-slate-700"
              >
                Email
              </Link>
              <Link
                href="/admin/settings"
                className="rounded-full border border-slate-300 px-5 py-3 font-black text-slate-700"
              >
                Настройки
              </Link>
              <Link
                href="/portal"
                className="rounded-full border border-slate-300 px-5 py-3 font-black text-slate-700"
              >
                Кабинет клиента
              </Link>
              <form action="/api/auth/logout" method="post">
                <button className="rounded-full bg-slate-950 px-5 py-3 font-black text-white">
                  Выйти
                </button>
              </form>
            </div>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [String(stats.total), 'всего обращений'],
              [String(stats.open), 'открыто'],
              [String(stats.waiting), 'ожидают клиента'],
              [String(stats.critical), 'критических'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-3xl border border-slate-200 bg-white p-7">
                <p className="text-4xl font-black text-blue-600">{value}</p>
                <p className="mt-2 font-bold text-slate-600">{label}</p>
              </div>
            ))}
          </div>

          <form className="mt-8 grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-[1fr_180px_180px_160px_auto]">
            <input
              name="q"
              defaultValue={params.q}
              placeholder="Поиск по номеру или теме"
              className="rounded-2xl border border-slate-300 px-4 py-3"
            />
            <select
              name="status"
              defaultValue={params.status ?? ''}
              className="rounded-2xl border border-slate-300 px-4 py-3"
            >
              <option value="">Все статусы</option>
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              name="priority"
              defaultValue={params.priority ?? ''}
              className="rounded-2xl border border-slate-300 px-4 py-3"
            >
              <option value="">Все приоритеты</option>
              <option value="CRITICAL">Критический</option>
              <option value="HIGH">Высокий</option>
              <option value="NORMAL">Обычный</option>
              <option value="LOW">Низкий</option>
            </select>
            <select
              name="sla"
              defaultValue={params.sla ?? ''}
              className="rounded-2xl border border-slate-300 px-4 py-3"
            >
              <option value="">Любой SLA</option>
              <option value="overdue">Только просроченные</option>
            </select>
            <button className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">
              Применить
            </button>
          </form>

          <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-2xl font-black">Все обращения</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {requests.map((item) => (
                <Link
                  href={`/admin/requests/${item.id}`}
                  key={item.id}
                  className="grid gap-3 px-6 py-5 transition hover:bg-slate-50 md:grid-cols-[110px_1fr_160px_140px_130px] md:items-center"
                >
                  <span className="font-black text-blue-600">{item.id}</span>
                  <span className="font-bold text-slate-900">{item.title}</span>
                  <span className="text-sm font-bold text-slate-500">{item.category}</span>
                  <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                    {labels[item.status]}
                  </span>
                  <span
                    className={`text-sm font-bold ${item.status !== 'RESOLVED' && new Date(item.dueAt).getTime() < now ? 'text-red-600' : 'text-slate-500'}`}
                  >
                    {item.status !== 'RESOLVED' && new Date(item.dueAt).getTime() < now
                      ? 'SLA просрочен'
                      : `до ${new Date(item.dueAt).toLocaleDateString('ru-RU')}`}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
