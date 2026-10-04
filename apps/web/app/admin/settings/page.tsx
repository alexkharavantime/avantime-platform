import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageShell } from '../../../components/page-shell';
import { localePath, type Locale } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';
import { getSession } from '../../../lib/session';

const copy = {
  lv: { title: 'Sistēmas iestatījumi', description: 'Ārējo pakalpojumu gatavības pārbaude, neatklājot slepenās vērtības.', eyebrow: 'Administrēšana', configured: 'Konfigurēts', missing: 'Jākonfigurē', checks: ['Pastāvīga lietotāju un pieprasījumu glabāšana', 'Uzdevumu izveide un sinhronizācija', 'Aizsargāto sīkdatņu parakstīšana', 'Vietējā krātuve konfigurēta ar UPLOAD_DIR', 'Izmantota .data/uploads krātuve; vairākiem serveriem pieslēdziet S3', 'Resend ir pieslēgts', 'Demonstrācijas režīms: vēstules tiek izvadītas konsolē'] },
  ru: { title: 'Системные настройки', description: 'Контроль готовности внешних сервисов без раскрытия секретных значений.', eyebrow: 'Администрирование', configured: 'Настроено', missing: 'Требует настройки', checks: ['Постоянное хранение пользователей и обращений', 'Создание и синхронизация задач', 'Подпись защищённых cookies', 'Локальное хранилище настроено через UPLOAD_DIR', 'Используется .data/uploads; для нескольких серверов подключите S3', 'Подключён Resend', 'Демо-режим: письма выводятся в консоль'] },
  en: { title: 'System settings', description: 'Check external service readiness without exposing secret values.', eyebrow: 'Administration', configured: 'Configured', missing: 'Needs configuration', checks: ['Persistent storage for users and requests', 'Task creation and synchronization', 'Signing protected cookies', 'Local storage configured through UPLOAD_DIR', 'Using .data/uploads; connect S3 for multiple servers', 'Resend is connected', 'Demo mode: emails are written to the console'] },
} satisfies Record<Locale, { title: string; description: string; eyebrow: string; configured: string; missing: string; checks: string[] }>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${copy[await getLocale()].title} — Avantime` };
}

export default async function SettingsPage() {
  const locale = await getLocale();
  const text = copy[locale];
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') redirect(localePath(locale, '/portal/login'));
  const checks = [
    ['PostgreSQL', Boolean(process.env.DATABASE_URL), text.checks[0]],
    ['Jira', Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_API_TOKEN), text.checks[1]],
    [locale === 'ru' ? 'Секрет сессий' : locale === 'lv' ? 'Sesijas noslēpums' : 'Session secret', Boolean(process.env.SESSION_SECRET), text.checks[2]],
    [locale === 'ru' ? 'Хранилище файлов' : locale === 'lv' ? 'Failu krātuve' : 'File storage', true, process.env.UPLOAD_DIR ? text.checks[3] : text.checks[4]],
    ['Email', Boolean(process.env.RESEND_API_KEY), process.env.RESEND_API_KEY ? text.checks[5] : text.checks[6]],
  ] as const;
  return (
    <PageShell>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <p className="eyebrow">{text.eyebrow}</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-6xl">
            {text.title}
          </h1>
          <p className="mt-4 text-lg text-slate-600">{text.description}</p>
          <div className="mt-10 grid gap-5">
            {checks.map(([name, enabled, description]) => (
              <div
                key={name}
                className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h2 className="text-xl font-black">{name}</h2>
                  <p className="mt-1 text-slate-600">{description}</p>
                </div>
                <span
                  className={`w-fit rounded-full px-4 py-2 text-sm font-black ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                >
                  {enabled ? text.configured : text.missing}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
