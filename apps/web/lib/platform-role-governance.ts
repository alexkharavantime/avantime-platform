import { getPrisma } from '@avantime/database';
import type { Prisma } from '@prisma/client';

import { executeGovernanceApproval, GovernanceApprovalError } from './governance-approvals';
import { approvalStepUpSatisfied } from './governance-approval-policy';
import type { AppSession } from './session';

const ASSIGNABLE_PLATFORM_ROLES = new Set([
  'PLATFORM_ADMIN',
  'PLATFORM_SUPPORT',
  'PLATFORM_AUDITOR',
  'PLATFORM_OPERATOR',
] as const);

export async function changePlatformRoleAssignment(input: {
  session: AppSession;
  targetUserId: string;
  role: string;
  active: boolean;
  expectedVersion: number;
  confirmation: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!ASSIGNABLE_PLATFORM_ROLES.has(input.role as never))
    throw new GovernanceApprovalError('PLATFORM_ROLE_INVALID');
  if (
    !approvalStepUpSatisfied({
      mfaSatisfied: input.session.mfaSatisfied,
      authenticationAt: input.session.authenticationAt,
      now,
    })
  ) {
    throw new GovernanceApprovalError('PLATFORM_ROLE_STEP_UP_REQUIRED');
  }
  if (input.confirmation !== (input.active ? 'ASSIGN PLATFORM ROLE' : 'REMOVE PLATFORM ROLE')) {
    throw new GovernanceApprovalError('PLATFORM_ROLE_CONFIRMATION_REQUIRED');
  }
  const prisma = await getPrisma();
  if (!prisma) throw new GovernanceApprovalError('PLATFORM_ROLE_DATABASE_UNAVAILABLE');
  return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const target = await transaction.user.findUnique({
      where: { id: input.targetUserId },
      select: { active: true, disabledAt: true },
    });
    if (!target?.active || target.disabledAt)
      throw new GovernanceApprovalError('PLATFORM_ROLE_TARGET_INACTIVE');
    const role = input.role as
      'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT' | 'PLATFORM_AUDITOR' | 'PLATFORM_OPERATOR';
    const existing = await transaction.platformRoleAssignment.findUnique({
      where: { userId_role: { userId: input.targetUserId, role } },
    });
    if ((existing?.version ?? 0) !== input.expectedVersion)
      throw new GovernanceApprovalError('PLATFORM_ROLE_VERSION_CHANGED');
    if (!existing && !input.active) {
      throw new GovernanceApprovalError('PLATFORM_ROLE_ASSIGNMENT_NOT_FOUND');
    }
    let assignment;
    if (existing) {
      const changed = await transaction.platformRoleAssignment.updateMany({
        where: { id: existing.id, version: input.expectedVersion },
        data: {
          active: input.active,
          disabledAt: input.active ? null : now,
          assignedById: input.session.userId,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new GovernanceApprovalError('PLATFORM_ROLE_VERSION_CHANGED');
      assignment = await transaction.platformRoleAssignment.findUniqueOrThrow({
        where: { id: existing.id },
      });
    } else {
      assignment = await transaction.platformRoleAssignment.create({
        data: {
          userId: input.targetUserId,
          role,
          active: input.active,
          disabledAt: input.active ? null : now,
          assignedById: input.session.userId,
        },
      });
    }
    await transaction.userSession.updateMany({
      where: { userId: input.targetUserId, revokedAt: null },
      data: { revokedAt: now },
    });
    await transaction.productionAuditEvent.create({
      data: {
        id: crypto.randomUUID(),
        companyId: null,
        actorId: input.session.userId,
        action: input.active ? 'platform.role.assigned' : 'platform.role.removed',
        targetType: 'platform-role-assignment',
        targetId: assignment.id,
        result: 'SUCCEEDED',
        correlationId: crypto.randomUUID(),
        safeMetadata: { role, assignmentVersion: assignment.version },
      },
    });
    return assignment;
  });
}

export async function executePlatformOwnerChange(input: {
  session: AppSession;
  approvalId: string;
  targetUserId: string;
  action: 'ASSIGN' | 'REMOVE';
  authorized: boolean;
  now?: Date;
}) {
  const prisma = await getPrisma();
  if (!prisma) throw new GovernanceApprovalError('APPROVAL_DATABASE_UNAVAILABLE');
  const existing = await prisma.platformRoleAssignment.findUnique({
    where: { userId_role: { userId: input.targetUserId, role: 'PLATFORM_OWNER' } },
  });
  const currentVersion = existing?.version ?? 0;
  return executeGovernanceApproval({
    session: input.session,
    requestId: input.approvalId,
    executionKey: `platform-owner:${input.approvalId}`,
    executionAuthorized: input.authorized,
    expectedActionType:
      input.action === 'ASSIGN' ? 'PLATFORM_OWNER_ASSIGN' : 'PLATFORM_OWNER_REMOVE',
    currentResourceVersion: currentVersion,
    now: input.now,
    execute: async (transaction, request) => {
      if (
        request.safeParameters.targetUserId !== input.targetUserId ||
        request.safeParameters.assignmentVersion !== currentVersion ||
        request.resourceId !== input.targetUserId
      ) {
        throw new GovernanceApprovalError('APPROVAL_TARGET_CHANGED');
      }
      await transaction.$queryRaw`
        SELECT 1::INTEGER AS "locked"
        FROM (SELECT pg_advisory_xact_lock(12012026)) AS platform_owner_lock
      `;
      const target = await transaction.user.findUnique({
        where: { id: input.targetUserId },
        select: { id: true, active: true, disabledAt: true },
      });
      if (!target?.active || target.disabledAt)
        throw new GovernanceApprovalError('PLATFORM_ROLE_TARGET_INACTIVE');
      const current = await transaction.platformRoleAssignment.findUnique({
        where: { userId_role: { userId: input.targetUserId, role: 'PLATFORM_OWNER' } },
      });
      if ((current?.version ?? 0) !== currentVersion) {
        throw new GovernanceApprovalError('PLATFORM_ROLE_VERSION_CHANGED');
      }
      if (input.action === 'REMOVE') {
        const activeOwners = await transaction.platformRoleAssignment.count({
          where: { role: 'PLATFORM_OWNER', active: true, disabledAt: null },
        });
        if (activeOwners <= 1 || !current?.active)
          throw new GovernanceApprovalError('LAST_PLATFORM_OWNER_PROTECTED');
      }
      let assignment;
      if (!current) {
        assignment = await transaction.platformRoleAssignment.create({
          data: {
            userId: input.targetUserId,
            role: 'PLATFORM_OWNER',
            assignedById: input.session.userId,
          },
        });
      } else {
        const changed = await transaction.platformRoleAssignment.updateMany({
          where: { id: current.id, version: currentVersion },
          data: {
            active: input.action === 'ASSIGN',
            disabledAt: input.action === 'ASSIGN' ? null : (input.now ?? new Date()),
            assignedById: input.session.userId,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new GovernanceApprovalError('PLATFORM_ROLE_VERSION_CHANGED');
        }
        assignment = await transaction.platformRoleAssignment.findUniqueOrThrow({
          where: { id: current.id },
        });
      }
      await transaction.userSession.updateMany({
        where: { userId: input.targetUserId, revokedAt: null },
        data: { revokedAt: input.now ?? new Date() },
      });
      await transaction.productionAuditEvent.create({
        data: {
          id: crypto.randomUUID(),
          companyId: null,
          actorId: input.session.userId,
          action: input.action === 'ASSIGN' ? 'platform.owner.assigned' : 'platform.owner.removed',
          targetType: 'platform-role-assignment',
          targetId: assignment.id,
          result: 'SUCCEEDED',
          correlationId: crypto.randomUUID(),
          safeMetadata: { approvalId: input.approvalId, assignmentVersion: assignment.version },
        },
      });
      return assignment;
    },
  });
}
