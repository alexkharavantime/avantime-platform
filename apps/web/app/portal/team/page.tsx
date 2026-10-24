import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TeamInviteForm } from '../../../components/portal/team-invite-form';
import { TeamManagement } from '../../../components/portal/team-management';
import { getValidatedPortalSession } from '../../../lib/portal-session';
import { listCompanyMembers } from '../../../lib/team';
import {
  hasOrganizationPermission,
  resolveOrganizationRole,
} from '../../../lib/organization-permissions';
import type { OrganizationRole } from '../../../lib/session';
import { getLocale } from '../../../lib/i18n-server';
import { localePath, type Locale } from '../../../lib/i18n';

const copy: Record<Locale, { metadata: string; eyebrow: string; title: string; description: string }> = {
  lv: { metadata: 'Uzņēmuma komanda — Avantime', eyebrow: 'Klienta kabinets', title: 'Uzņēmuma komanda', description: 'Darbinieki, kuri var izveidot un sekot jūsu uzņēmuma pieprasījumiem.' },
  ru: { metadata: 'Команда компании — Avantime', eyebrow: 'Кабинет клиента', title: 'Команда компании', description: 'Сотрудники, которым доступно создание и отслеживание обращений вашей компании.' },
  en: { metadata: 'Company team — Avantime', eyebrow: 'Client portal', title: 'Company team', description: 'People who can create and track requests for your company.' },
};

export async function generateMetadata(): Promise<Metadata> {
  return { title: copy[await getLocale()].metadata };
}

export default async function TeamPage() {
  const locale = await getLocale();
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login?returnTo=/portal/team'));
  if (!hasOrganizationPermission(session, 'members.view')) redirect(localePath(locale, '/portal'));
  const members = await listCompanyMembers(session);
  const actorRole = resolveOrganizationRole(session).role;
  const assignableRoles =
    actorRole === 'OWNER'
      ? (['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'] as const)
      : actorRole === 'ADMIN'
        ? (['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'] as const)
        : (['MEMBER', 'VIEWER'] as const);
  const activeOwnerCount = members.filter(
    (member) => member.role === 'OWNER' && member.status === 'ACTIVE',
  ).length;
  const invitableRoles = assignableRoles.filter((role) => role !== 'OWNER') as Exclude<
    OrganizationRole,
    'OWNER'
  >[];
  const text = copy[locale];
  return (
    <section className="py-10">
      <div className="mx-auto max-w-6xl px-6">
        <p className="eyebrow">{text.eyebrow}</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-6xl">
          {text.title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">{text.description}</p>
        {hasOrganizationPermission(session, 'members.invite') && (
          <div className="mt-10">
            <TeamInviteForm roles={invitableRoles} locale={locale} />
          </div>
        )}
        <TeamManagement
          initialMembers={members}
          assignableRoles={[...assignableRoles]}
          mayManageRoles={hasOrganizationPermission(session, 'members.role.manage')}
          mayRemoveMembers={hasOrganizationPermission(session, 'members.remove')}
          currentUserId={session.userId}
          locale={locale}
          canBootstrapOwner={
            activeOwnerCount === 0 && actorRole === 'ADMIN' && session.role === 'ADMIN'
          }
        />
      </div>
    </section>
  );
}
