import { createHash, randomBytes } from 'node:crypto';
import { getPrisma } from '@avantime/database';
import type { Prisma, PrismaClient } from '@prisma/client';

import {
  appendOrganizationAudit,
  createOrganizationSecurityNotification,
} from './organization-audit';
import {
  evaluateRoleAssignment,
  evaluateCriticalOrganizationAction,
  resolveOrganizationRole,
} from './organization-permissions';
import type { AppSession, MembershipStatus, OrganizationRole } from './session';

const INVITATION_TTL_MS = 72 * 60 * 60_000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export type TeamMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  jobTitle: string;
  role: OrganizationRole;
  status: MembershipStatus;
  version: number;
  active: boolean;
};

type TeamMembershipRow = Prisma.OrganizationMembershipGetPayload<{ include: { user: true } }>;

const demoMembers: TeamMember[] = [
  {
    id: 'demo-membership-user',
    userId: 'demo-user',
    name: 'Александр',
    email: 'demo@avantime.lv',
    jobTitle: 'Руководитель',
    role: 'MEMBER',
    status: 'ACTIVE',
    version: 1,
    active: true,
  },
  {
    id: 'demo-membership-accountant',
    userId: 'demo-accountant',
    name: 'Ирина',
    email: 'accounting@example.lv',
    jobTitle: 'Главный бухгалтер',
    role: 'MEMBER',
    status: 'ACTIVE',
    version: 1,
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

export class TeamGovernanceError extends Error {
  constructor(
    readonly code:
      | 'MEMBERSHIP_NOT_FOUND'
      | 'MEMBERSHIP_VERSION_CONFLICT'
      | 'ROLE_ASSIGNMENT_DENIED'
      | 'LAST_OWNER_PROTECTED'
      | 'SELF_MEMBERSHIP_CHANGE_DENIED'
      | 'FIRST_OWNER_BOOTSTRAP_DENIED'
      | 'DATABASE_UNAVAILABLE',
  ) {
    super('Organization membership operation failed.');
  }
}

function requireCompanyId(session: AppSession) {
  if (!session.companyId) throw new TeamGovernanceError('MEMBERSHIP_NOT_FOUND');
  return session.companyId;
}

function requireDatabase(prisma: PrismaClient | null) {
  if (!prisma) throw new TeamGovernanceError('DATABASE_UNAVAILABLE');
  return prisma;
}

function legacyRole(role: OrganizationRole): 'CLIENT' | 'ADMIN' {
  return role === 'ADMIN' || role === 'OWNER' ? 'ADMIN' : 'CLIENT';
}

function canInviteRole(actorRole: OrganizationRole, invitedRole: OrganizationRole) {
  if (invitedRole === 'OWNER') return false;
  if (actorRole === 'OWNER') return true;
  if (actorRole === 'ADMIN') return true;
  return actorRole === 'MANAGER' && (invitedRole === 'MEMBER' || invitedRole === 'VIEWER');
}

function canManageMembership(actorRole: OrganizationRole, targetRole: OrganizationRole) {
  if (actorRole === 'OWNER') return true;
  if (actorRole === 'ADMIN') return targetRole !== 'OWNER';
  return actorRole === 'MANAGER' && (targetRole === 'MEMBER' || targetRole === 'VIEWER');
}

export function canInviteExistingMember(
  session: AppSession,
  existing: {
    companyId: string | null;
    memberships?: Array<{
      companyId: string;
      active: boolean;
      status?: MembershipStatus;
    }>;
  } | null,
) {
  if (!session.companyId || !existing) return Boolean(session.companyId);
  const memberships = existing.memberships ?? [];
  return (
    existing.companyId === session.companyId ||
    memberships.some(
      (membership) =>
        membership.active &&
        membership.status !== 'REMOVED' &&
        membership.companyId === session.companyId,
    ) ||
    (existing.companyId === null && memberships.length === 0)
  );
}

export async function listCompanyMembers(session: AppSession): Promise<TeamMember[]> {
  if (!session.companyId) return [];
  if (process.env.DATABASE_URL) {
    try {
      const prisma = await getPrisma();
      const memberships = await prisma?.organizationMembership.findMany({
        where: { companyId: session.companyId, status: { not: 'REMOVED' } },
        include: { user: true },
        orderBy: { user: { name: 'asc' } },
      });
      if (memberships) {
        return memberships.map((membership: TeamMembershipRow) => ({
          id: membership.id,
          userId: membership.userId,
          name: membership.user.name,
          email: membership.user.email,
          jobTitle: membership.user.jobTitle ?? '',
          role: membership.organizationRole,
          status: membership.status,
          version: membership.version,
          active: membership.active && membership.status === 'ACTIVE',
        }));
      }
    } catch {
      console.warn('Cannot load company members.');
      return [];
    }
  }
  return demoMembers;
}

export async function inviteCompanyMember(
  session: AppSession,
  input: Pick<TeamMember, 'name' | 'email' | 'jobTitle'> & { role?: OrganizationRole },
  now = new Date(),
) {
  const companyId = requireCompanyId(session);
  const actorRole = resolveOrganizationRole(session).role;
  const role = input.role ?? 'MEMBER';
  if (!actorRole || !canInviteRole(actorRole, role)) {
    throw new TeamInvitationError('INVITATION_FORBIDDEN');
  }
  if (process.env.DATABASE_URL) {
    const prisma = await getPrisma();
    if (prisma) {
      const emailNormalized = input.email.trim().normalize('NFKC').toLowerCase();
      const token = randomBytes(32).toString('base64url');
      const invitation = await prisma.$transaction(async (database: Prisma.TransactionClient) => {
        const existing = await database.organizationMembership.findFirst({
          where: {
            companyId,
            user: { emailNormalized },
            status: { in: ['ACTIVE', 'SUSPENDED', 'REMOVED'] },
          },
          select: { id: true },
        });
        if (existing) throw new TeamInviteConflictError();
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
            role: legacyRole(role),
            organizationRole: role,
            invitedBy: session.userId,
            expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
          },
        });
      });
      return {
        id: invitation.id,
        email: emailNormalized,
        role: invitation.organizationRole,
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
    role,
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
    invitation.organizationRole === 'OWNER' ||
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
      memberships: {
        where: { companyId: invitation.companyId },
        select: { id: true, status: true },
        take: 1,
      },
    },
  });
  if (!user?.emailVerifiedAt && user?.externalIdentities.length === 0) {
    throw new TeamInvitationError('INVITATION_IDENTITY_UNVERIFIED');
  }
  if (user.memberships[0]?.status === 'REMOVED' || user.memberships[0]?.status === 'SUSPENDED') {
    throw new TeamInvitationError('INVITATION_FORBIDDEN');
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
      update: {
        active: true,
        status: 'ACTIVE',
        role: invitation.role,
        organizationRole: invitation.organizationRole,
        version: { increment: 1 },
        suspendedAt: null,
        removedAt: null,
      },
      create: {
        userId: session.userId,
        companyId: invitation.companyId,
        role: invitation.role,
        organizationRole: invitation.organizationRole,
        status: 'ACTIVE',
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
  const companyId = requireCompanyId(session);
  const prisma = await getPrisma();
  if (!prisma) throw new TeamInvitationError('INVITATION_NOT_FOUND');
  const revoked = await prisma.identityInvitation.updateMany({
    where: {
      id: invitationId,
      companyId,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  if (revoked.count !== 1) throw new TeamInvitationError('INVITATION_NOT_FOUND');
}

async function loadMembershipForChange(
  prisma: PrismaClient,
  companyId: string,
  membershipId: string,
) {
  const membership = await prisma.organizationMembership.findFirst({
    where: { id: membershipId, companyId, status: { not: 'REMOVED' } },
  });
  if (!membership) throw new TeamGovernanceError('MEMBERSHIP_NOT_FOUND');
  return membership;
}

async function lockOrganizationGovernance(database: Prisma.TransactionClient, companyId: string) {
  await database.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${companyId} FOR UPDATE`;
}

async function revokeTargetSessions(
  database: Prisma.TransactionClient,
  userId: string,
  companyId: string,
  now: Date,
) {
  await database.userSession.updateMany({
    where: { userId, companyId, revokedAt: null },
    data: { revokedAt: now },
  });
}

export async function changeOrganizationMemberRole(input: {
  session: AppSession;
  membershipId: string;
  nextRole: string;
  expectedVersion: number;
  correlationId: string;
  allowAdminOwnerAssignment?: boolean;
  confirmation?: string;
}) {
  const companyId = requireCompanyId(input.session);
  const actorRole = resolveOrganizationRole(input.session).role;
  if (!actorRole) throw new TeamGovernanceError('ROLE_ASSIGNMENT_DENIED');
  const prisma = requireDatabase((await getPrisma()) as PrismaClient | null);
  const membership = await loadMembershipForChange(prisma, companyId, input.membershipId);
  if (
    input.nextRole === 'OWNER' &&
    !evaluateCriticalOrganizationAction(
      input.session,
      'organization.owner.assign',
      input.confirmation,
    ).allowed
  ) {
    throw new TeamGovernanceError('ROLE_ASSIGNMENT_DENIED');
  }
  const now = new Date();
  const result = await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    await lockOrganizationGovernance(database, companyId);
    const activeOwnerCount = await database.organizationMembership.count({
      where: { companyId, organizationRole: 'OWNER', status: 'ACTIVE', active: true },
    });
    const decision = evaluateRoleAssignment({
      actorId: input.session.userId,
      actorRole,
      targetUserId: membership.userId,
      currentRole: membership.organizationRole,
      nextRole: input.nextRole,
      activeOwnerCount,
      allowAdminOwnerAssignment: input.allowAdminOwnerAssignment,
    });
    if (!decision.allowed || !decision.role) {
      throw new TeamGovernanceError(
        decision.reasonCode === 'LAST_OWNER_PROTECTED'
          ? 'LAST_OWNER_PROTECTED'
          : 'ROLE_ASSIGNMENT_DENIED',
      );
    }
    const nextRole = decision.role;
    const update = await database.organizationMembership.updateMany({
      where: {
        id: membership.id,
        companyId,
        version: input.expectedVersion,
        status: 'ACTIVE',
      },
      data: {
        organizationRole: nextRole,
        role: legacyRole(nextRole),
        version: { increment: 1 },
      },
    });
    if (update.count !== 1) throw new TeamGovernanceError('MEMBERSHIP_VERSION_CONFLICT');
    await revokeTargetSessions(database, membership.userId, companyId, now);
    const changed = await database.organizationMembership.findUniqueOrThrow({
      where: { id: membership.id },
    });
    return { changed, nextRole };
  });
  const { changed, nextRole } = result;
  const ownerAssigned = nextRole === 'OWNER' && membership.organizationRole !== 'OWNER';
  await appendOrganizationAudit(input.session, {
    action: ownerAssigned ? 'organization.owner.assigned' : 'organization.role.changed',
    result: 'SUCCEEDED',
    targetType: 'membership',
    targetId: membership.id,
    correlationId: input.correlationId,
    metadata: {
      previousRole: membership.organizationRole,
      nextRole,
      membershipVersion: changed.version,
    },
  });
  await createOrganizationSecurityNotification({
    session: input.session,
    targetUserId: membership.userId,
    title: ownerAssigned
      ? 'Вы назначены владельцем организации'
      : 'Ваша роль в организации изменена',
  });
  return changed;
}

export async function changeOrganizationMembershipStatus(input: {
  session: AppSession;
  membershipId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
  expectedVersion: number;
  correlationId: string;
}) {
  const companyId = requireCompanyId(input.session);
  const actorRole = resolveOrganizationRole(input.session).role;
  if (!actorRole) throw new TeamGovernanceError('ROLE_ASSIGNMENT_DENIED');
  const prisma = requireDatabase((await getPrisma()) as PrismaClient | null);
  const membership = await loadMembershipForChange(prisma, companyId, input.membershipId);
  if (membership.userId === input.session.userId && input.status !== 'ACTIVE') {
    throw new TeamGovernanceError('SELF_MEMBERSHIP_CHANGE_DENIED');
  }
  if (!canManageMembership(actorRole, membership.organizationRole)) {
    throw new TeamGovernanceError('ROLE_ASSIGNMENT_DENIED');
  }
  const now = new Date();
  const changed = await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    await lockOrganizationGovernance(database, companyId);
    if (membership.organizationRole === 'OWNER' && input.status !== 'ACTIVE') {
      const activeOwnerCount = await database.organizationMembership.count({
        where: { companyId, organizationRole: 'OWNER', status: 'ACTIVE', active: true },
      });
      if (activeOwnerCount <= 1) throw new TeamGovernanceError('LAST_OWNER_PROTECTED');
    }
    const update = await database.organizationMembership.updateMany({
      where: {
        id: membership.id,
        companyId,
        version: input.expectedVersion,
      },
      data: {
        status: input.status,
        active: input.status === 'ACTIVE',
        suspendedAt: input.status === 'SUSPENDED' ? now : null,
        removedAt: input.status === 'REMOVED' ? now : null,
        version: { increment: 1 },
      },
    });
    if (update.count !== 1) throw new TeamGovernanceError('MEMBERSHIP_VERSION_CONFLICT');
    if (input.status !== 'ACTIVE') {
      await revokeTargetSessions(database, membership.userId, companyId, now);
    }
    return database.organizationMembership.findUniqueOrThrow({ where: { id: membership.id } });
  });
  const action =
    input.status === 'SUSPENDED'
      ? 'organization.member.suspended'
      : input.status === 'REMOVED'
        ? 'organization.member.removed'
        : 'organization.member.reactivated';
  await appendOrganizationAudit(input.session, {
    action,
    result: 'SUCCEEDED',
    targetType: 'membership',
    targetId: membership.id,
    correlationId: input.correlationId,
    metadata: {
      membershipStatus: input.status,
      membershipVersion: changed.version,
    },
  });
  await createOrganizationSecurityNotification({
    session: input.session,
    targetUserId: membership.userId,
    title:
      input.status === 'SUSPENDED'
        ? 'Доступ к организации приостановлен'
        : input.status === 'REMOVED'
          ? 'Доступ к организации удалён'
          : 'Ваша роль в организации изменена',
  });
  return changed;
}

export async function bootstrapFirstOrganizationOwner(input: {
  session: AppSession;
  membershipId: string;
  expectedVersion: number;
  correlationId: string;
  confirmation?: string;
}) {
  const companyId = requireCompanyId(input.session);
  const actorRole = resolveOrganizationRole(input.session).role;
  if (actorRole !== 'ADMIN' || input.session.role !== 'ADMIN') {
    throw new TeamGovernanceError('FIRST_OWNER_BOOTSTRAP_DENIED');
  }
  if (
    !evaluateCriticalOrganizationAction(
      input.session,
      'organization.owner.assign',
      input.confirmation,
    ).allowed
  ) {
    throw new TeamGovernanceError('FIRST_OWNER_BOOTSTRAP_DENIED');
  }
  const prisma = requireDatabase((await getPrisma()) as PrismaClient | null);
  const membership = await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    await lockOrganizationGovernance(database, companyId);
    const activeOwnerCount = await database.organizationMembership.count({
      where: { companyId, organizationRole: 'OWNER', status: 'ACTIVE', active: true },
    });
    if (activeOwnerCount !== 0) {
      throw new TeamGovernanceError('FIRST_OWNER_BOOTSTRAP_DENIED');
    }
    const current = await database.organizationMembership.findFirst({
      where: {
        userId: input.session.userId,
        id: input.membershipId,
        companyId,
        organizationRole: 'ADMIN',
        status: 'ACTIVE',
        active: true,
        version: input.expectedVersion,
      },
    });
    if (!current) throw new TeamGovernanceError('FIRST_OWNER_BOOTSTRAP_DENIED');
    const changed = await database.organizationMembership.updateMany({
      where: {
        id: current.id,
        version: input.expectedVersion,
        organizationRole: 'ADMIN',
        status: 'ACTIVE',
      },
      data: {
        organizationRole: 'OWNER',
        role: 'ADMIN',
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw new TeamGovernanceError('MEMBERSHIP_VERSION_CONFLICT');
    return current;
  });
  await appendOrganizationAudit(input.session, {
    action: 'organization.owner.assigned',
    result: 'SUCCEEDED',
    targetType: 'membership',
    targetId: membership.id,
    correlationId: input.correlationId,
    metadata: {
      previousRole: 'ADMIN',
      nextRole: 'OWNER',
      membershipVersion: input.expectedVersion + 1,
    },
  });
  await createOrganizationSecurityNotification({
    session: input.session,
    targetUserId: input.session.userId,
    title: 'Вы назначены владельцем организации',
  });
  return { membershipId: membership.id, version: input.expectedVersion + 1 };
}
