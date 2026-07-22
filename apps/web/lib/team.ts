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
  { id: 'demo-user', name: 'Александр', email: 'demo@avantime.lv', jobTitle: 'Руководитель', role: 'CLIENT', active: true },
  { id: 'demo-accountant', name: 'Ирина', email: 'accounting@example.lv', jobTitle: 'Главный бухгалтер', role: 'CLIENT', active: true },
];

export async function listCompanyMembers(session: AppSession): Promise<TeamMember[]> {
  if (process.env.DATABASE_URL && session.companyId) {
    try {
      const prisma = await getPrisma();
      const users = await prisma?.user.findMany({ where: { companyId: session.companyId }, orderBy: { name: 'asc' } });
      if (users) return users.map((user: { id: string; name: string; email: string; jobTitle: string | null; role: 'CLIENT' | 'ADMIN'; active: boolean }) => ({ id: user.id, name: user.name, email: user.email, jobTitle: user.jobTitle ?? '', role: user.role, active: user.active }));
    } catch (error) {
      console.warn('Cannot load company members.', error);
    }
  }
  return demoMembers;
}

export async function inviteCompanyMember(session: AppSession, input: Pick<TeamMember, 'name' | 'email' | 'jobTitle'>) {
  if (process.env.DATABASE_URL && session.companyId) {
    const prisma = await getPrisma();
    if (prisma) {
      const user = await prisma.user.upsert({
        where: { email: input.email },
        update: { name: input.name, jobTitle: input.jobTitle || null, companyId: session.companyId, active: true },
        create: { name: input.name, email: input.email, jobTitle: input.jobTitle || null, companyId: session.companyId, role: 'CLIENT', active: true },
      });
      return { id: user.id, name: user.name, email: user.email, jobTitle: user.jobTitle ?? '', role: user.role, active: user.active } satisfies TeamMember;
    }
  }
  const member: TeamMember = { id: `demo-${Date.now()}`, ...input, role: 'CLIENT', active: true };
  demoMembers.push(member);
  return member;
}
