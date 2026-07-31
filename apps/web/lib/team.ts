import { createHash, randomBytes } from 'node:crypto';
import { getPrisma } from '@avantime/database';
import type { Prisma } from '@prisma/client';

import type { AppSession } from './session';

const INVITATION_TTL_MS = 72 * 60 * 60_000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

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

export class TeamInvitationError extends Error {
  constructor(
    readonly code:
      | 'INVITATION_INVALID'
      | 'INVITATION_FORBIDDEN'
      | 'INVITATION_IDENTITY_UNVERIFIED'
      | 'INVITATION_NOT_FOUND',
  ) {
    super('Team invitation operation failed.');
  }
}

export function canInviteExistingMember(
  session: AppSession,
  existing: {
    companyId: string | null;
    memberships?: Array<{ companyId: string; active: boolean }>;
  } | null,
) {
  if (!session.companyId || !existing) return Boolean(session.companyId);
  const memberships = existing.memberships ?? [];
  return (
    existing.companyId === session.companyId ||
    memberships.some(
      (membership) => membership.active && membership.companyId === session.companyId,
    ) ||
    (existing.companyId === null && memberships.length === 0)
  );
}

export async function listCompanyMembers(session: AppSession): Promise<TeamMember[]> {
  if (!session.companyId) return [];
  if (process.env.DATABASE_URL && session.companyId) {
    try {
      const prisma = await getPrisma();
      const users = await prisma?.user.findMany({
        where: {
          memberships: {
            some: { companyId: session.companyId, active: true },
          },
        },
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
  now = new Date(),
) {
  const companyId = session.companyId;
  if (!companyId) throw new Error('Company membership is required.');
  if (process.env.DATABASE_URL) {
    const prisma = await getPrisma();
    if (prisma) {
      const emailNormalized = input.email.trim().normalize('NFKC').toLowerCase();
      const token = randomBytes(32).toString('base64url');
      const invitation = await prisma.$transaction(async (database: Prisma.TransactionClient) => {
        await database.identityInvitation.updateMany({
          where: {
            companyId,
            emailNormalized,
            acceptedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        return database.identityInvitation.create({
          data: {
            tokenHash: digest(token),
            companyId,
            emailNormalized,
            role: 'CLIENT',
            invitedBy: session.userId,
            expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
          },
        });
      });
      return {
        id: invitation.id,
        email: emailNormalized,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        token,
      };
    }
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Team storage is unavailable.');
  }
  return {
    id: `demo-invitation-${Date.now()}`,
    email: input.email,
    role: 'CLIENT' as const,
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    token: randomBytes(32).toString('base64url'),
  };
}

export async function acceptCompanyInvitation(
  session: AppSession,
  token: string,
  now = new Date(),
) {
  const prisma = await getPrisma();
  if (!prisma) throw new TeamInvitationError('INVITATION_INVALID');
  const invitation = await prisma.identityInvitation.findUnique({
    where: { tokenHash: digest(token) },
  });
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt <= now ||
    invitation.role !== 'CLIENT' ||
    invitation.emailNormalized !== session.email.trim().normalize('NFKC').toLowerCase()
  ) {
    throw new TeamInvitationError('INVITATION_INVALID');
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      externalIdentities: {
        where: { emailVerified: true },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!user?.emailVerifiedAt && user?.externalIdentities.length === 0) {
    throw new TeamInvitationError('INVITATION_IDENTITY_UNVERIFIED');
  }
  await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    const accepted = await database.identityInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { acceptedAt: now, acceptedBy: session.userId },
    });
    if (accepted.count !== 1) throw new TeamInvitationError('INVITATION_INVALID');
    await database.organizationMembership.upsert({
      where: {
        userId_companyId: {
          userId: session.userId,
          companyId: invitation.companyId,
        },
      },
      update: { active: true, role: invitation.role },
      create: {
        userId: session.userId,
        companyId: invitation.companyId,
        role: invitation.role,
        active: true,
      },
    });
    if (!user.companyId) {
      await database.user.update({
        where: { id: session.userId },
        data: { companyId: invitation.companyId },
      });
    }
  });
  return { invitationId: invitation.id, companyId: invitation.companyId };
}

export async function revokeCompanyInvitation(session: AppSession, invitationId: string) {
  if (!session.companyId) throw new TeamInvitationError('INVITATION_FORBIDDEN');
  const prisma = await getPrisma();
  if (!prisma) throw new TeamInvitationError('INVITATION_NOT_FOUND');
  const revoked = await prisma.identityInvitation.updateMany({
    where: {
      id: invitationId,
      companyId: session.companyId,
      acceptedAt: null,
      revokedAt: null,
      ...(session.role === 'ADMIN' ? {} : { invitedBy: session.userId }),
    },
    data: { revokedAt: new Date() },
  });
  if (revoked.count !== 1) throw new TeamInvitationError('INVITATION_NOT_FOUND');
}
