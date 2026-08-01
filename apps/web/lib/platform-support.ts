import { getPrisma } from '@avantime/database';
import type { Prisma } from '@prisma/client';

import { approvalStepUpSatisfied } from './governance-approval-policy';
import type { PlatformPermission, PlatformSupportSessionContext } from './platform-permissions';
import type { AppSession } from './session';

const SUPPORT_SCOPES = new Set<PlatformPermission>([
  'platform.support.organization.view',
  'platform.support.resource.view',
  'platform.support.action.execute',
]);
const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,199}$/u;

export class PlatformSupportError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export async function startPlatformSupportSession(input: {
  session: AppSession;
  companyId: string;
  reasonCode: string;
  ticketReference: string;
  allowedScopes: string[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (
    !approvalStepUpSatisfied({
      mfaSatisfied: input.session.mfaSatisfied,
      authenticationAt: input.session.authenticationAt,
      now,
    })
  ) {
    throw new PlatformSupportError('SUPPORT_STEP_UP_REQUIRED');
  }
  if (!SAFE_REFERENCE.test(input.reasonCode) || !SAFE_REFERENCE.test(input.ticketReference)) {
    throw new PlatformSupportError('SUPPORT_REASON_INVALID');
  }
  const scopes = [...new Set(input.allowedScopes)];
  if (
    scopes.length === 0 ||
    scopes.some((scope) => !SUPPORT_SCOPES.has(scope as PlatformPermission))
  ) {
    throw new PlatformSupportError('SUPPORT_SCOPE_INVALID');
  }
  const prisma = await getPrisma();
  if (!prisma) throw new PlatformSupportError('SUPPORT_DATABASE_UNAVAILABLE');
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true },
  });
  if (!company) throw new PlatformSupportError('SUPPORT_ORGANIZATION_NOT_FOUND');
  return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const supportSession = await transaction.platformSupportSession.create({
      data: {
        actorId: input.session.userId,
        companyId: company.id,
        reasonCode: input.reasonCode,
        ticketReference: input.ticketReference,
        allowedScopes: scopes,
        mfaVerifiedAt: now,
        authenticatedAt: new Date(input.session.authenticationAt!),
        expiresAt: new Date(now.getTime() + 15 * 60_000),
      },
    });
    await transaction.productionAuditEvent.create({
      data: {
        id: crypto.randomUUID(),
        companyId: company.id,
        actorId: input.session.userId,
        action: 'platform.support.session.started',
        targetType: 'support-session',
        targetId: supportSession.id,
        result: 'SUCCEEDED',
        correlationId: crypto.randomUUID(),
        safeMetadata: { reasonCode: input.reasonCode, ticketReference: input.ticketReference },
      },
    });
    const recipients = await transaction.organizationMembership.findMany({
      where: {
        companyId: company.id,
        active: true,
        status: 'ACTIVE',
        organizationRole: { in: ['OWNER', 'ADMIN'] },
      },
      select: { userId: true },
    });
    if (recipients.length > 0) {
      await transaction.portalNotification.createMany({
        data: recipients.map(({ userId }: { userId: string }) => ({
          userId,
          companyId: company.id,
          category: 'SECURITY',
          title: 'Открыта контролируемая support-сессия',
          href: '/portal/settings/security/audit',
        })),
      });
    }
    return supportSession;
  });
}

export async function endPlatformSupportSession(input: {
  session: AppSession;
  supportSessionId: string;
  now?: Date;
}) {
  const prisma = await getPrisma();
  if (!prisma) throw new PlatformSupportError('SUPPORT_DATABASE_UNAVAILABLE');
  await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const supportSession = await transaction.platformSupportSession.findFirst({
      where: { id: input.supportSessionId, actorId: input.session.userId, endedAt: null },
    });
    if (!supportSession) throw new PlatformSupportError('SUPPORT_SESSION_END_DENIED');
    const result = await transaction.platformSupportSession.updateMany({
      where: { id: supportSession.id, endedAt: null },
      data: { endedAt: input.now ?? new Date(), endedById: input.session.userId },
    });
    if (result.count !== 1) throw new PlatformSupportError('SUPPORT_SESSION_END_DENIED');
    await transaction.productionAuditEvent.create({
      data: {
        id: crypto.randomUUID(),
        companyId: supportSession.companyId,
        actorId: input.session.userId,
        action: 'platform.support.session.ended',
        targetType: 'support-session',
        targetId: supportSession.id,
        result: 'SUCCEEDED',
        correlationId: crypto.randomUUID(),
        safeMetadata: {},
      },
    });
  });
}

export async function loadPlatformSupportSession(input: {
  actorId: string;
  supportSessionId: string;
}): Promise<PlatformSupportSessionContext | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const row = await prisma.platformSupportSession.findFirst({
    where: { id: input.supportSessionId, actorId: input.actorId },
  });
  if (!row || !Array.isArray(row.allowedScopes)) return null;
  return {
    id: row.id,
    actorId: row.actorId,
    companyId: row.companyId,
    allowedScopes: (row.allowedScopes as unknown[]).filter(
      (scope: unknown): scope is string => typeof scope === 'string',
    ),
    expiresAt: row.expiresAt,
    endedAt: row.endedAt,
  };
}

export async function terminatePlatformSupportSessionByOperator(input: {
  operatorUserId: string;
  supportSessionId: string;
  confirmation: string;
  now?: Date;
}) {
  if (input.confirmation !== 'TERMINATE SUPPORT SESSION') {
    throw new PlatformSupportError('SUPPORT_TERMINATION_CONFIRMATION_REQUIRED');
  }
  if (!SAFE_REFERENCE.test(input.operatorUserId) || !SAFE_REFERENCE.test(input.supportSessionId)) {
    throw new PlatformSupportError('SUPPORT_REFERENCE_INVALID');
  }
  const prisma = await getPrisma();
  if (!prisma) throw new PlatformSupportError('SUPPORT_DATABASE_UNAVAILABLE');
  const now = input.now ?? new Date();
  return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const operator = await transaction.platformRoleAssignment.findFirst({
      where: {
        userId: input.operatorUserId,
        role: { in: ['PLATFORM_OWNER', 'PLATFORM_ADMIN'] },
        active: true,
        disabledAt: null,
        user: { active: true, disabledAt: null },
      },
      select: { id: true },
    });
    if (!operator) throw new PlatformSupportError('SUPPORT_TERMINATION_DENIED');
    const supportSession = await transaction.platformSupportSession.findUnique({
      where: { id: input.supportSessionId },
    });
    if (!supportSession) throw new PlatformSupportError('SUPPORT_SESSION_NOT_FOUND');
    if (supportSession.endedAt) {
      return { terminated: false, alreadyEnded: true, endedAt: supportSession.endedAt };
    }
    const changed = await transaction.platformSupportSession.updateMany({
      where: { id: supportSession.id, endedAt: null },
      data: { endedAt: now, endedById: input.operatorUserId },
    });
    if (changed.count !== 1) throw new PlatformSupportError('SUPPORT_SESSION_END_DENIED');
    await transaction.productionAuditEvent.create({
      data: {
        id: crypto.randomUUID(),
        companyId: supportSession.companyId,
        actorId: input.operatorUserId,
        action: 'platform.support.session.terminated',
        targetType: 'support-session',
        targetId: supportSession.id,
        result: 'SUCCEEDED',
        correlationId: crypto.randomUUID(),
        safeMetadata: {},
      },
    });
    return { terminated: true, alreadyEnded: false, endedAt: now };
  });
}
