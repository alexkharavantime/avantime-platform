import { redirect } from 'next/navigation';
import { PageShell } from '../../../components/page-shell';
import { listEmailQueue } from '../../../lib/email';
import { localePath, type Locale } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';
import { getSession } from '../../../lib/session';

const copy = {
  lv: { eyebrow: 'Administrēšana', title: 'E-pasta rinda', empty: 'Vēstuļu vēl nav.', attempts: 'mēģ.', statuses: { PENDING: 'Gaida', SENDING: 'Sūta', SENT: 'Nosūtīts', FAILED: 'Neizdevās' } },
  ru: { eyebrow: 'Администрирование', title: 'Очередь электронной почты', empty: 'Писем пока нет.', attempts: 'попыт.', statuses: { PENDING: 'Ожидает', SENDING: 'Отправляется', SENT: 'Отправлено', FAILED: 'Ошибка' } },
  en: { eyebrow: 'Administration', title: 'Email queue', empty: 'There are no emails yet.', attempts: 'attempts', statuses: { PENDING: 'Pending', SENDING: 'Sending', SENT: 'Sent', FAILED: 'Failed' } },
} satisfies Record<Locale, { eyebrow: string; title: string; empty: string; attempts: string; statuses: Record<string, string> }>;

export default async function Page() {
  const locale = await getLocale();
  const text = copy[locale];
  const s = await getSession();
  if (!s || s.role !== 'ADMIN') redirect(localePath(locale, '/portal/login'));
  const rows = await listEmailQueue();
  return (
    <PageShell>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-6">
          <p className="eyebrow">{text.eyebrow}</p>
          <h1 className="mt-4 text-5xl font-black">{text.title}</h1>
          <div className="mt-10 overflow-hidden rounded-3xl border bg-white">
            {rows.length === 0 ? (
              <p className="p-6 text-slate-500">{text.empty}</p>
            ) : (
              rows.map((r) => (
                <div
                  key={r.id}
                  className="grid gap-2 border-b p-5 lg:grid-cols-[100px_1fr_1fr_140px_100px_180px]"
                >
                  <strong>{text.statuses[r.status] ?? r.status}</strong>
                  <span>{r.recipient}</span>
                  <span>{r.subject}</span>
                  <span>{r.template}</span>
                  <span>{r.attempts} {text.attempts}</span>
                  <time>{new Date(r.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB')}</time>
                  {r.lastError && <p className="lg:col-span-6 text-red-600">{r.lastError}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
