import { getPrisma } from '@avantime/database';
import type { AppSession } from './session';

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  role: 'CLIENT' | 'ADMIN';
  active: boolean;
};

const demoMembers: TeamMember[] = [
  {
    id: 'demo-user',
    name: 'Александр',
    email: 'demo@avantime.lv',
    jobTitle: 'Руководитель',
    role: 'CLIENT',
    active: true,
  },
  {
    id: 'demo-accountant',
    name: 'Ирина',
    email: 'accounting@example.lv',
    jobTitle: 'Главный бухгалтер',
    role: 'CLIENT',
    active: true,
  },
];

export class TeamInviteConflictError extends Error {
  readonly code = 'TEAM_EMAIL_ALREADY_ASSIGNED';
}

export function canInviteExistingMember(
  session: AppSession,
  existing: { companyId: string | null } | null,
) {
  return Boolean(session.companyId && (!existing || existing.companyId === session.companyId));
}

export async function listCompanyMembers(session: AppSession): Promise<TeamMember[]> {
  if (!session.companyId) return [];
  if (process.env.DATABASE_URL && session.companyId) {
    try {
      const prisma = await getPrisma();
      const users = await prisma?.user.findMany({
        where: { companyId: session.companyId },
        orderBy: { name: 'asc' },
      });
      if (users)
        return users.map(
          (user: {
            id: string;
            name: string;
            email: string;
            jobTitle: string | null;
            role: 'CLIENT' | 'ADMIN';
            active: boolean;
          }) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            jobTitle: user.jobTitle ?? '',
            role: user.role,
            active: user.active,
          }),
        );
    } catch {
      console.warn('Cannot load company members.');
      return [];
    }
  }
  return demoMembers;
}

export async function inviteCompanyMember(
  session: AppSession,
  input: Pick<TeamMember, 'name' | 'email' | 'jobTitle'>,
) {
  if (!session.companyId) throw new Error('Company membership is required.');
  if (process.env.DATABASE_URL && session.companyId) {
    const prisma = await getPrisma();
    if (prisma) {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (!canInviteExistingMember(session, existing)) {
        throw new TeamInviteConflictError('Email is already assigned to another company.');
      }
      const user = existing
        ? await prisma.user.update({
            where: { id: existing.id },
            data: { name: input.name, jobTitle: input.jobTitle || null, active: true },
          })
        : await prisma.user.create({
            data: {
              name: input.name,
              email: input.email,
              jobTitle: input.jobTitle || null,
              companyId: session.companyId,
              role: 'CLIENT',
              active: true,
            },
          });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        jobTitle: user.jobTitle ?? '',
        role: user.role,
        active: user.active,
      } satisfies TeamMember;
    }
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Team storage is unavailable.');
  }
  const member: TeamMember = { id: `demo-${Date.now()}`, ...input, role: 'CLIENT', active: true };
  demoMembers.push(member);
  return member;
}
