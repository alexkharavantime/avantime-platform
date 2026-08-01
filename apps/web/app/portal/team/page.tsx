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

export const metadata: Metadata = { title: 'Команда компании — Avantime' };

export default async function TeamPage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/portal/team');
  if (!hasOrganizationPermission(session, 'members.view')) redirect('/portal');
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
        {hasOrganizationPermission(session, 'members.invite') && (
          <div className="mt-10">
            <TeamInviteForm roles={invitableRoles} />
          </div>
        )}
        <TeamManagement
          initialMembers={members}
          assignableRoles={[...assignableRoles]}
          mayManageRoles={hasOrganizationPermission(session, 'members.role.manage')}
          mayRemoveMembers={hasOrganizationPermission(session, 'members.remove')}
          currentUserId={session.userId}
          canBootstrapOwner={
            activeOwnerCount === 0 && actorRole === 'ADMIN' && session.role === 'ADMIN'
          }
        />
      </div>
    </section>
  );
}
