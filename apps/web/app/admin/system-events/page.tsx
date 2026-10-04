import { redirect } from 'next/navigation';
import { PageShell } from '../../../components/page-shell';
import { localePath, type Locale } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';
import { getSession } from '../../../lib/session';
import { listSystemEvents } from '../../../lib/system-events';

const copy = {
  lv: { eyebrow: 'Administrēšana', title: 'Sistēmas notikumi', empty: 'Notikumu vēl nav.' },
  ru: { eyebrow: 'Администрирование', title: 'Системные события', empty: 'Событий пока нет.' },
  en: { eyebrow: 'Administration', title: 'System events', empty: 'There are no events yet.' },
} satisfies Record<Locale, { eyebrow: string; title: string; empty: string }>;

export default async function Page() {
  const locale = await getLocale();
  const text = copy[locale];
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') redirect(localePath(locale, '/portal/login'));
  const items = await listSystemEvents();
  return (
    <PageShell>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <p className="eyebrow">{text.eyebrow}</p>
          <h1 className="mt-4 text-5xl font-black">{text.title}</h1>
          <div className="mt-10 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            {items.length === 0 ? (
              <p className="p-6 text-slate-500">{text.empty}</p>
            ) : (
              items.map((i) => (
                <div
                  key={i.id}
                  className="grid gap-2 border-b border-slate-100 p-5 sm:grid-cols-[120px_160px_1fr_190px]"
                >
                  <strong>{i.level}</strong>
                  <span>{i.category}</span>
                  <span>
                    {i.message}
                    {i.actorEmail ? ` · ${i.actorEmail}` : ''}
                  </span>
                  <time className="text-sm text-slate-500">
                    {new Date(i.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB')}
                  </time>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
