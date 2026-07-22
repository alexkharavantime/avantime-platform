import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageShell } from '../../../components/page-shell';
import { getSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Системные настройки — Avantime' };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') redirect('/portal/login');
  const checks = [
    ['PostgreSQL', Boolean(process.env.DATABASE_URL), 'Постоянное хранение пользователей и обращений'],
    ['Jira', Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_API_TOKEN), 'Создание и синхронизация задач'],
    ['Секрет сессий', Boolean(process.env.SESSION_SECRET), 'Подпись защищенных cookies'],
    ['Хранилище файлов', true, process.env.UPLOAD_DIR ? 'Локальное хранилище настроено через UPLOAD_DIR' : 'Используется .data/uploads; для нескольких серверов подключите S3'],
    ['Email', Boolean(process.env.RESEND_API_KEY), process.env.RESEND_API_KEY ? 'Подключён Resend' : 'Демо-режим: письма выводятся в консоль'],
  ] as const;
  return <PageShell><section className="bg-slate-50 py-16"><div className="mx-auto max-w-5xl px-6"><p className="eyebrow">Администрирование</p><h1 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-6xl">Системные настройки</h1><p className="mt-4 text-lg text-slate-600">Контроль готовности внешних сервисов без раскрытия секретных значений.</p><div className="mt-10 grid gap-5">{checks.map(([name, enabled, description])=><div key={name} className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black">{name}</h2><p className="mt-1 text-slate-600">{description}</p></div><span className={`w-fit rounded-full px-4 py-2 text-sm font-black ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{enabled ? 'Настроено' : 'Требует настройки'}</span></div>)}</div></div></section></PageShell>;
}
