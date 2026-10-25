import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '../../../components/page-shell';
import { localePath, type Locale } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';
import { listRequests } from '../../../lib/requests-store';
import { getSession } from '../../../lib/session';

const copy = {
  lv: { title: 'Paziņojumi — Avantime Admin', eyebrow: 'Pakalpojuma uzraudzība', back: '← Atpakaļ uz paneli', heading: 'Paziņojumi un eskalācijas', attention: 'nepieciešama uzmanība', overdue: 'SLA termiņš nokavēts', critical: 'Kritiska prioritāte', due: 'Kontroles termiņš:', clear: 'Visi pieprasījumi tiek kontrolēti', none: 'Nav kavētu vai kritisku pieprasījumu.', demoCompany: 'Demo uzņēmums' },
  ru: { title: 'Уведомления — Avantime Admin', eyebrow: 'Контроль сервиса', back: '← Назад в панель', heading: 'Уведомления и эскалации', attention: 'требуют внимания', overdue: 'SLA просрочен', critical: 'Критический приоритет', due: 'Контрольный срок:', clear: 'Все обращения под контролем', none: 'Просроченных и критических обращений нет.', demoCompany: 'Демо-компания' },
  en: { title: 'Notifications — Avantime Admin', eyebrow: 'Service monitoring', back: '← Back to dashboard', heading: 'Notifications and escalations', attention: 'require attention', overdue: 'SLA overdue', critical: 'Critical priority', due: 'Due by:', clear: 'All requests are under control', none: 'There are no overdue or critical requests.', demoCompany: 'Demo company' },
} satisfies Record<Locale, { title: string; eyebrow: string; back: string; heading: string; attention: string; overdue: string; critical: string; due: string; clear: string; none: string; demoCompany: string }>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: copy[await getLocale()].title };
}

export default async function NotificationsPage() {
  const locale = await getLocale();
  const text = copy[locale];
  const session = await getSession();
  if (!session) redirect(localePath(locale, '/portal/login'));
  if (session.role !== 'ADMIN') redirect(localePath(locale, '/portal'));

  const now = Date.now();
  const requests = await listRequests();
  const alerts = requests
    .filter(
      (item) =>
        item.status !== 'RESOLVED' &&
        (new Date(item.dueAt).getTime() < now || item.priority === 'CRITICAL'),
    )
    .map((item) => ({
      ...item,
      overdue: new Date(item.dueAt).getTime() < now,
    }));

  return (
    <PageShell>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <Link href={localePath(locale, '/admin')} className="font-bold text-blue-600">
            {text.back}
          </Link>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-black text-blue-600">{text.eyebrow}</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">{text.heading}</h1>
            </div>
            <span className="rounded-full bg-red-100 px-4 py-2 font-black text-red-700">
              {alerts.length} {text.attention}
            </span>
          </div>

          <div className="mt-8 space-y-4">
            {alerts.length ? (
              alerts.map((item) => (
                <Link
                  key={item.id}
                  href={localePath(locale, `/admin/requests/${item.id}`)}
                  className="block rounded-3xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-blue-600">{item.id}</p>
                      <h2 className="mt-1 text-xl font-black">{item.title}</h2>
                      <p className="mt-2 text-sm text-slate-500">
                        {item.companyName ?? text.demoCompany} · {item.category}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${item.overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}
                    >
                      {item.overdue ? text.overdue : text.critical}
                    </span>
                  </div>
                  <p className="mt-4 text-sm font-bold text-slate-600">
                    {text.due} {new Date(item.dueAt).toLocaleString(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB')}
                  </p>
                </Link>
              ))
            ) : (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center">
                <p className="text-2xl font-black text-emerald-800">{text.clear}</p>
                <p className="mt-2 text-emerald-700">{text.none}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
