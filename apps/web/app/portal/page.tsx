import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '../../components/page-shell';
import { listRequests } from '../../lib/requests-store';
import { getSession } from '../../lib/session';

export const metadata: Metadata = { title: 'Кабинет клиента — Avantime', description: 'Обращения, документы и база знаний Avantime.' };
const labels = { NEW: 'Новое', IN_PROGRESS: 'В работе', WAITING_CUSTOMER: 'Нужно уточнение', RESOLVED: 'Решено' } as const;

export default async function PortalPage() {
  const session = await getSession(); if (!session) redirect('/portal/login');
  const requests = await listRequests();
  const open = requests.filter((r)=>r.status !== 'RESOLVED').length;
  const waiting = requests.filter((r)=>r.status === 'WAITING_CUSTOMER').length;
  return <PageShell><section className="bg-slate-50 py-16 sm:py-20"><div className="mx-auto max-w-7xl px-6">
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="eyebrow">Кабинет клиента</p><h1 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-6xl">Добрый день, {session.name}</h1><p className="mt-5 text-lg text-slate-600">{session.company} · {session.email}</p></div><div className="flex flex-wrap gap-3"><Link href="/portal/team" className="rounded-full border border-slate-300 px-5 py-3 font-black text-slate-700">Команда</Link><Link href="/portal/profile" className="rounded-full border border-slate-300 px-5 py-3 font-black text-slate-700">Профиль</Link><form action="/api/auth/logout" method="post"><button className="rounded-full border border-slate-300 px-5 py-3 font-black text-slate-700">Выйти</button></form><Link href="/portal/requests/new" className="rounded-full bg-blue-600 px-6 py-3 font-black text-white">Создать обращение</Link></div></div>
    <div className="mt-10 grid gap-5 md:grid-cols-3">{[[String(open),'открытых обращения'],[String(waiting),'ждет уточнения'],['14','материалов в базе знаний']].map(([v,l])=><div key={l} className="rounded-3xl border border-slate-200 bg-white p-7"><p className="text-4xl font-black text-blue-600">{v}</p><p className="mt-2 font-bold text-slate-600">{l}</p></div>)}</div>
    <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-6 py-5"><h2 className="text-2xl font-black">Последние обращения</h2></div><div className="divide-y divide-slate-100">{requests.map((r)=><Link href={`/portal/requests/${r.id}`} key={r.id} className="grid gap-3 px-6 py-5 transition hover:bg-slate-50 md:grid-cols-[120px_1fr_180px_160px] md:items-center"><span className="font-black text-blue-600">{r.id}</span><span className="font-bold text-slate-900">{r.title}</span><span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{labels[r.status]}</span><span className="text-sm text-slate-500">{new Date(r.updatedAt).toLocaleDateString('ru-RU')}</span></Link>)}</div></div>
    <div className="mt-8 grid gap-5 md:grid-cols-2"><Link href="/knowledge" className="rounded-3xl bg-slate-950 p-7 text-white"><p className="text-sm font-black uppercase tracking-widest text-cyan-300">База знаний</p><h2 className="mt-3 text-2xl font-black">Ответы и инструкции</h2><p className="mt-3 text-slate-300">Материалы по 1С, интеграциям и автоматизации.</p></Link><Link href="/assistant" className="rounded-3xl bg-blue-600 p-7 text-white"><p className="text-sm font-black uppercase tracking-widest text-blue-100">Avantime AI</p><h2 className="mt-3 text-2xl font-black">Получить первичную консультацию</h2><p className="mt-3 text-blue-100">Опишите задачу и получите направление решения.</p></Link></div>
  </div></section></PageShell>;
}
