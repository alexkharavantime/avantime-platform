import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '../../../components/page-shell';
import { ProfileForm } from '../../../components/portal/profile-form';
import { getAccountProfile } from '../../../lib/account';
import { getSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Профиль клиента — Avantime' };

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect('/portal/login');
  const profile = await getAccountProfile(session);

  return (
    <PageShell>
      <section className="bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-6">
          <Link href="/portal" className="font-black text-blue-600">← Вернуться в кабинет</Link>
          <p className="eyebrow mt-8">Настройки кабинета</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-6xl">Профиль и компания</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Эти данные используются в обращениях, документах и будущих интеграциях с Jira и 1С.
          </p>
          <ProfileForm initialProfile={profile} />
        </div>
      </section>
    </PageShell>
  );
}
