import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '../../../components/portal/login-form';
import { PageShell } from '../../../components/page-shell';
import { getSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Вход в кабинет — Avantime' };

function safeReturnTo(value?: string) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : undefined;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  const session = await getSession();
  if (session) redirect(returnTo ?? (session.role === 'ADMIN' ? '/admin' : '/portal'));
  return <PageShell><section className="bg-slate-50 py-20"><div className="mx-auto max-w-md px-6"><div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-950/5"><p className="eyebrow">Кабинет клиента</p><h1 className="mt-4 text-4xl font-black tracking-tight">Вход</h1><p className="mt-3 text-slate-600">Обращения, документы, статусы и база знаний в одном месте.</p><LoginForm returnTo={returnTo} /></div></div></section></PageShell>;
}
