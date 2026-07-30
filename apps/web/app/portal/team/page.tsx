import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TeamInviteForm } from '../../../components/portal/team-invite-form';
import { getValidatedPortalSession } from '../../../lib/portal-session';
import { listCompanyMembers } from '../../../lib/team';

export const metadata: Metadata = { title: 'Команда компании — Avantime' };

export default async function TeamPage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/portal/team');
  const members = await listCompanyMembers(session);
  return (
    <section className="py-10">
      <div className="mx-auto max-w-6xl px-6">
        <p className="eyebrow">Кабинет клиента</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-6xl">
          Команда компании
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Сотрудники, которым доступно создание и отслеживание обращений вашей компании.
        </p>
        <div className="mt-10">
          <TeamInviteForm />
        </div>
        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <div className="grid grid-cols-[1fr_1fr] gap-4 border-b border-slate-200 px-6 py-4 text-sm font-black text-slate-500 md:grid-cols-[1.2fr_1.5fr_1fr_100px_120px]">
            <span>Сотрудник</span>
            <span>Email</span>
            <span className="hidden md:block">Должность</span>
            <span className="hidden md:block">Роль</span>
            <span className="hidden md:block">Статус</span>
          </div>
          {members.map((member) => (
            <div
              key={member.id}
              className="grid grid-cols-[1fr_1fr] gap-4 border-b border-slate-100 px-6 py-5 last:border-0 md:grid-cols-[1.2fr_1.5fr_1fr_100px_120px]"
            >
              <span className="font-black">{member.name}</span>
              <span className="break-all text-slate-600">{member.email}</span>
              <span className="hidden text-slate-600 md:block">{member.jobTitle || '—'}</span>
              <span className="hidden text-sm font-bold text-slate-600 md:block">
                {member.role === 'ADMIN' ? 'Администратор' : 'Клиент'}
              </span>
              <span className="hidden md:block">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                  {member.active ? 'Активен' : 'Отключен'}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
