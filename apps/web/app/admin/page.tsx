import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '../../components/page-shell';
import { localePath, type Locale } from '../../lib/i18n';
import { getLocale } from '../../lib/i18n-server';
import { listRequests } from '../../lib/requests-store';
import { getSession } from '../../lib/session';

const copyByLocale: Record<Locale, {
  metadataTitle: string;
  eyebrow: string;
  title: string;
  articles: string;
  documents: string;
  email: string;
  settings: string;
  clientPortal: string;
  logout: string;
  stats: [string, string, string, string];
  searchPlaceholder: string;
  allStatuses: string;
  statuses: Record<'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED', string>;
  allPriorities: string;
  priorities: [string, string, string, string];
  anySla: string;
  overdueOnly: string;
  apply: string;
  allRequests: string;
  empty: string;
  overdue: string;
  duePrefix: string;
  dateLocale: string;
}> = {
  lv: {
    metadataTitle: 'Administrēšana — Avantime',
    eyebrow: 'Administrēšanas panelis',
    title: 'Klientu servisa pārvaldība',
    articles: 'Raksti',
    documents: 'Dokumenti',
    email: 'E-pasts',
    settings: 'Iestatījumi',
    clientPortal: 'Klienta kabinets',
    logout: 'Iziet',
    stats: ['kopā pieprasījumu', 'atvērti', 'gaida klientu', 'kritiski'],
    searchPlaceholder: 'Meklēt pēc numura vai tēmas',
    allStatuses: 'Visi statusi',
    statuses: { NEW: 'Jauns', OPEN: 'Atvērts', IN_PROGRESS: 'Procesā', WAITING_CUSTOMER: 'Nepieciešams precizējums', RESOLVED: 'Atrisināts', CLOSED: 'Slēgts' },
    allPriorities: 'Visas prioritātes',
    priorities: ['Kritisks', 'Augsts', 'Parasts', 'Zems'],
    anySla: 'Jebkurš SLA',
    overdueOnly: 'Tikai nokavētie',
    apply: 'Piemērot',
    allRequests: 'Visi pieprasījumi',
    empty: 'Pieprasījumi nav atrasti.',
    overdue: 'SLA termiņš nokavēts',
    duePrefix: 'līdz',
    dateLocale: 'lv-LV',
  },
  ru: {
    metadataTitle: 'Администрирование — Avantime',
    eyebrow: 'Административная панель',
    title: 'Управление клиентским сервисом',
    articles: 'Статьи',
    documents: 'Документы',
    email: 'Электронная почта',
    settings: 'Настройки',
    clientPortal: 'Кабинет клиента',
    logout: 'Выйти',
    stats: ['всего обращений', 'открыто', 'ожидают клиента', 'критических'],
    searchPlaceholder: 'Поиск по номеру или теме',
    allStatuses: 'Все статусы',
    statuses: { NEW: 'Новое', OPEN: 'Открыто', IN_PROGRESS: 'В работе', WAITING_CUSTOMER: 'Нужно уточнение', RESOLVED: 'Решено', CLOSED: 'Закрыто' },
    allPriorities: 'Все приоритеты',
    priorities: ['Критический', 'Высокий', 'Обычный', 'Низкий'],
    anySla: 'Любой SLA',
    overdueOnly: 'Только просроченные',
    apply: 'Применить',
    allRequests: 'Все обращения',
    empty: 'Обращения не найдены.',
    overdue: 'SLA просрочен',
    duePrefix: 'до',
    dateLocale: 'ru-RU',
  },
  en: {
    metadataTitle: 'Administration — Avantime',
    eyebrow: 'Administration panel',
    title: 'Customer service management',
    articles: 'Articles',
    documents: 'Documents',
    email: 'Email',
    settings: 'Settings',
    clientPortal: 'Client portal',
    logout: 'Sign out',
    stats: ['total requests', 'open', 'awaiting customer', 'critical'],
    searchPlaceholder: 'Search by number or subject',
    allStatuses: 'All statuses',
    statuses: { NEW: 'New', OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_CUSTOMER: 'Needs clarification', RESOLVED: 'Resolved', CLOSED: 'Closed' },
    allPriorities: 'All priorities',
    priorities: ['Critical', 'High', 'Normal', 'Low'],
    anySla: 'Any SLA',
    overdueOnly: 'Overdue only',
    apply: 'Apply',
    allRequests: 'All requests',
    empty: 'No requests found.',
    overdue: 'SLA overdue',
    duePrefix: 'due',
    dateLocale: 'en-GB',
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: copyByLocale[locale].metadataTitle };
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; priority?: string; sla?: string }>;
}) {
  const locale = await getLocale();
  const copy = copyByLocale[locale];
  const session = await getSession();
  if (!session) redirect(localePath(locale, '/portal/login'));
  if (session.role !== 'ADMIN') redirect(localePath(locale, '/portal'));

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
              <p className="eyebrow">{copy.eyebrow}</p>
              <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-6xl">
                {copy.title}
              </h1>
              <p className="mt-5 text-lg text-slate-600">
                {session.name} · {session.email}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={localePath(locale, '/admin/knowledge')}
                className="rounded-full border border-slate-300 px-5 py-3 font-black text-slate-700"
              >
                {copy.articles}
              </Link>
              <Link
                href={localePath(locale, '/admin/documents')}
                className="rounded-full border border-slate-300 px-5 py-3 font-black text-slate-700"
              >
                {copy.documents}
              </Link>
              <Link
                href={localePath(locale, '/admin/email-queue')}
                className="rounded-full border border-slate-300 px-5 py-3 font-black text-slate-700"
              >
                {copy.email}
              </Link>
              <Link
                href={localePath(locale, '/admin/settings')}
                className="rounded-full border border-slate-300 px-5 py-3 font-black text-slate-700"
              >
                {copy.settings}
              </Link>
              <Link
                href={localePath(locale, '/portal')}
                className="rounded-full border border-slate-300 px-5 py-3 font-black text-slate-700"
              >
                {copy.clientPortal}
              </Link>
              <form action={localePath(locale, '/api/auth/logout')} method="post">
                <button className="rounded-full bg-slate-950 px-5 py-3 font-black text-white">
                  {copy.logout}
                </button>
              </form>
            </div>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [String(stats.total), copy.stats[0]],
              [String(stats.open), copy.stats[1]],
              [String(stats.waiting), copy.stats[2]],
              [String(stats.critical), copy.stats[3]],
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
              placeholder={copy.searchPlaceholder}
              className="rounded-2xl border border-slate-300 px-4 py-3"
            />
            <select
              name="status"
              defaultValue={params.status ?? ''}
              className="rounded-2xl border border-slate-300 px-4 py-3"
            >
              <option value="">{copy.allStatuses}</option>
              {Object.entries(copy.statuses).map(([value, label]) => (
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
              <option value="">{copy.allPriorities}</option>
              <option value="CRITICAL">{copy.priorities[0]}</option>
              <option value="HIGH">{copy.priorities[1]}</option>
              <option value="NORMAL">{copy.priorities[2]}</option>
              <option value="LOW">{copy.priorities[3]}</option>
            </select>
            <select
              name="sla"
              defaultValue={params.sla ?? ''}
              className="rounded-2xl border border-slate-300 px-4 py-3"
            >
              <option value="">{copy.anySla}</option>
              <option value="overdue">{copy.overdueOnly}</option>
            </select>
            <button className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">
              {copy.apply}
            </button>
          </form>

          <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-2xl font-black">{copy.allRequests}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {requests.length === 0 && <p className="px-6 py-8 text-slate-500">{copy.empty}</p>}
              {requests.map((item) => (
                <Link
                  href={localePath(locale, `/admin/requests/${item.id}`)}
                  key={item.id}
                  className="grid gap-3 px-6 py-5 transition hover:bg-slate-50 md:grid-cols-[110px_1fr_160px_140px_130px] md:items-center"
                >
                  <span className="font-black text-blue-600">{item.id}</span>
                  <span className="font-bold text-slate-900">{item.title}</span>
                  <span className="text-sm font-bold text-slate-500">{item.category}</span>
                  <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                    {copy.statuses[item.status]}
                  </span>
                  <span
                    className={`text-sm font-bold ${item.status !== 'RESOLVED' && new Date(item.dueAt).getTime() < now ? 'text-red-600' : 'text-slate-500'}`}
                  >
                    {item.status !== 'RESOLVED' && new Date(item.dueAt).getTime() < now
                      ? copy.overdue
                      : `${copy.duePrefix} ${new Date(item.dueAt).toLocaleDateString(copy.dateLocale)}`}
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
