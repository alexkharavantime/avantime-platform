import { Prisma } from '@prisma/client';
import { getPrisma } from '@avantime/database';

import {
  approvalStepUpSatisfied,
  getGovernanceApprovalPolicy,
  governanceApprovalFingerprint,
  type GovernanceApprovalAction,
  type GovernanceScope,
} from './governance-approval-policy';
import type { AppSession } from './session';

export class GovernanceApprovalError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

type SafeParameters = Record<string, string | number | boolean | null>;

function asSafeParameters(value: Prisma.JsonValue): SafeParameters {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new GovernanceApprovalError('APPROVAL_PAYLOAD_INVALID');
  }
  const entries = Object.entries(value);
  if (
    entries.some(
      ([, item]) => item !== null && !['string', 'number', 'boolean'].includes(typeof item),
    )
  ) {
    throw new GovernanceApprovalError('APPROVAL_PAYLOAD_INVALID');
  }
  return Object.fromEntries(entries) as SafeParameters;
}

function requireStepUp(session: AppSession, now: Date) {
  if (
    !approvalStepUpSatisfied({
      mfaSatisfied: session.mfaSatisfied,
      authenticationAt: session.authenticationAt,
      now,
    })
  ) {
    throw new GovernanceApprovalError('APPROVAL_STEP_UP_REQUIRED');
  }
}

export async function requestGovernanceApproval(input: {
  session: AppSession;
  actionType: GovernanceApprovalAction;
  scope: GovernanceScope;
  companyId?: string | null;
  resourceId?: string | null;
  expectedVersion?: number | null;
  safeParameters: SafeParameters;
  confirmation: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const approvalPolicy = getGovernanceApprovalPolicy(input.actionType);
  if (!approvalPolicy || approvalPolicy.scope !== input.scope) {
    throw new GovernanceApprovalError('UNKNOWN_APPROVAL_ACTION');
  }
  requireStepUp(input.session, now);
  if (input.confirmation !== approvalPolicy.confirmationPhrase) {
    throw new GovernanceApprovalError('APPROVAL_CONFIRMATION_REQUIRED');
  }
  if (input.scope === 'ORGANIZATION' && input.companyId !== input.session.companyId) {
    throw new GovernanceApprovalError('APPROVAL_SCOPE_MISMATCH');
  }
  if (
    (input.resourceId && input.resourceId.length > 200) ||
    (input.expectedVersion !== undefined &&
      input.expectedVersion !== null &&
      (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0))
  ) {
    throw new GovernanceApprovalError('APPROVAL_PAYLOAD_INVALID');
  }
  const safeParameters = asSafeParameters(input.safeParameters as Prisma.JsonValue);
  if (
    Object.keys(safeParameters).length > approvalPolicy.safeParameterKeys.length ||
    Object.values(safeParameters).some(
      (value) =>
        (typeof value === 'string' && value.length > 250) ||
        (typeof value === 'number' && !Number.isFinite(value)),
    )
  ) {
    throw new GovernanceApprovalError('APPROVAL_PAYLOAD_INVALID');
  }
  const expiresAt = new Date(now.getTime() + approvalPolicy.ttlSeconds * 1000);
  const payloadFingerprint = governanceApprovalFingerprint({
    actionType: input.actionType,
    scope: input.scope,
    companyId: input.companyId,
    resourceId: input.resourceId,
    expectedVersion: input.expectedVersion,
    safeParameters,
    requesterId: input.session.userId,
    expiresAt,
  });
  const prisma = await getPrisma();
  if (!prisma) throw new GovernanceApprovalError('APPROVAL_DATABASE_UNAVAILABLE');
  return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const approval = await transaction.governanceApprovalRequest.create({
      data: {
        actionType: input.actionType,
        scope: input.scope,
        companyId: input.companyId ?? null,
        resourceId: input.resourceId,
        expectedVersion: input.expectedVersion,
        safeParameters,
        payloadFingerprint,
        requesterId: input.session.userId,
        expiresAt,
      },
    });
    await transaction.productionAuditEvent.create({
      data: {
        id: crypto.randomUUID(),
        companyId: approval.companyId,
        actorId: input.session.userId,
        action: 'governance.approval.requested',
        targetType: 'governance-approval',
        targetId: approval.id,
        result: 'SUCCEEDED',
        correlationId: crypto.randomUUID(),
        safeMetadata: { actionType: approval.actionType, scope: approval.scope },
      },
    });
    const platformRecipients =
      approvalPolicy.notificationPolicy !== 'ORGANIZATION_SECURITY'
        ? await transaction.platformRoleAssignment.findMany({
            where: {
              active: true,
              disabledAt: null,
              role: { in: ['PLATFORM_OWNER', 'PLATFORM_ADMIN'] },
              userId: { not: input.session.userId },
            },
            select: { userId: true },
            distinct: ['userId'],
          })
        : [];
    const organizationRecipients =
      approvalPolicy.notificationPolicy !== 'PLATFORM_SECURITY' && approval.companyId
        ? await transaction.organizationMembership.findMany({
            where: {
              companyId: approval.companyId,
              active: true,
              status: 'ACTIVE',
              organizationRole: { in: ['OWNER', 'ADMIN'] },
              userId: { not: input.session.userId },
            },
            select: { userId: true },
            distinct: ['userId'],
          })
        : [];
    const platformRecipientIds = [
      ...new Set(platformRecipients.map(({ userId }: { userId: string }) => userId)),
    ];
    if (platformRecipientIds.length > 0) {
      await transaction.governanceNotification.createMany({
        data: platformRecipientIds.map((recipientId) => ({
          recipientId,
          companyId: approval.companyId,
          category: 'GOVERNANCE_APPROVAL',
          title: 'Требуется решение по критическому действию',
          href: '/portal/platform/approvals',
        })),
      });
    }
    const organizationRecipientIds = [
      ...new Set(organizationRecipients.map(({ userId }: { userId: string }) => userId)),
    ];
    if (organizationRecipientIds.length > 0 && approval.companyId) {
      await transaction.portalNotification.createMany({
        data: organizationRecipientIds.map((userId) => ({
          userId,
          companyId: approval.companyId!,
          category: 'SECURITY',
          title: 'Требуется решение по критическому действию',
          href: '/portal/settings/security/audit',
        })),
      });
    }
    return approval;
  });
}

export async function decideGovernanceApproval(input: {
  session: AppSession;
  requestId: string;
  approved: boolean;
  approverAuthorized: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  requireStepUp(input.session, now);
  if (!input.approverAuthorized) throw new GovernanceApprovalError('APPROVER_PERMISSION_DENIED');
  const prisma = await getPrisma();
  if (!prisma) throw new GovernanceApprovalError('APPROVAL_DATABASE_UNAVAILABLE');
  const candidate = await prisma.governanceApprovalRequest.findUnique({
    where: { id: input.requestId },
    select: { expiresAt: true, status: true },
  });
  if (candidate?.status === 'REQUESTED' && candidate.expiresAt <= now) {
    await prisma.governanceApprovalRequest.updateMany({
      where: { id: input.requestId, status: 'REQUESTED' },
      data: { status: 'EXPIRED' },
    });
    throw new GovernanceApprovalError('APPROVAL_EXPIRED');
  }
  return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const request = await transaction.governanceApprovalRequest.findUnique({
      where: { id: input.requestId },
      include: { decisions: true },
    });
    if (!request) throw new GovernanceApprovalError('APPROVAL_NOT_FOUND');
    if (request.scope === 'ORGANIZATION' && request.companyId !== input.session.companyId) {
      throw new GovernanceApprovalError('APPROVAL_SCOPE_MISMATCH');
    }
    if (request.requesterId === input.session.userId) {
      throw new GovernanceApprovalError('SELF_APPROVAL_DENIED');
    }
    if (request.status !== 'REQUESTED') throw new GovernanceApprovalError('APPROVAL_NOT_REQUESTED');
    if (request.expiresAt <= now) {
      throw new GovernanceApprovalError('APPROVAL_EXPIRED');
    }
    const approvalPolicy = getGovernanceApprovalPolicy(request.actionType);
    if (!approvalPolicy) throw new GovernanceApprovalError('UNKNOWN_APPROVAL_ACTION');
    await transaction.governanceApprovalDecision.create({
      data: {
        requestId: request.id,
        approverId: input.session.userId,
        approved: input.approved,
      },
    });
    const approvedCount =
      request.decisions.filter((decision: { approved: boolean }) => decision.approved).length +
      (input.approved ? 1 : 0);
    const status = input.approved
      ? approvedCount >= approvalPolicy.minimumApprovals
        ? 'APPROVED'
        : 'REQUESTED'
      : 'REJECTED';
    const changed = await transaction.governanceApprovalRequest.updateMany({
      where: { id: request.id, status: 'REQUESTED' },
      data: { status },
    });
    if (changed.count !== 1) throw new GovernanceApprovalError('APPROVAL_NOT_REQUESTED');
    const updated = await transaction.governanceApprovalRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: { decisions: true },
    });
    await transaction.productionAuditEvent.create({
      data: {
        id: crypto.randomUUID(),
        companyId: request.companyId,
        actorId: input.session.userId,
        action: input.approved ? 'governance.approval.approved' : 'governance.approval.rejected',
        targetType: 'governance-approval',
        targetId: request.id,
        result: 'SUCCEEDED',
        correlationId: crypto.randomUUID(),
        safeMetadata: { actionType: request.actionType, status },
      },
    });
    const decisionTitle = input.approved
      ? 'Критическое действие подтверждено'
      : 'Критическое действие отклонено';
    if (request.scope === 'ORGANIZATION' && request.companyId) {
      await transaction.portalNotification.create({
        data: {
          userId: request.requesterId,
          companyId: request.companyId,
          category: 'SECURITY',
          title: decisionTitle,
          href: '/portal/settings/security/audit',
        },
      });
    } else {
      await transaction.governanceNotification.create({
        data: {
          recipientId: request.requesterId,
          companyId: request.companyId,
          category: 'GOVERNANCE_APPROVAL',
          title: decisionTitle,
          href: '/portal/platform/approvals',
        },
      });
    }
    return updated;
  });
}

export async function cancelGovernanceApproval(input: {
  session: AppSession;
  requestId: string;
  now?: Date;
}) {
  const prisma = await getPrisma();
  if (!prisma) throw new GovernanceApprovalError('APPROVAL_DATABASE_UNAVAILABLE');
  await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const request = await transaction.governanceApprovalRequest.findFirst({
      where: { id: input.requestId, requesterId: input.session.userId, status: 'REQUESTED' },
    });
    if (!request) throw new GovernanceApprovalError('APPROVAL_CANCELLATION_DENIED');
    const cancelled = await transaction.governanceApprovalRequest.updateMany({
      where: { id: request.id, requesterId: input.session.userId, status: 'REQUESTED' },
      data: { status: 'CANCELLED', cancelledAt: input.now ?? new Date() },
    });
    if (cancelled.count !== 1) {
      throw new GovernanceApprovalError('APPROVAL_CANCELLATION_DENIED');
    }
    await transaction.productionAuditEvent.create({
      data: {
        id: crypto.randomUUID(),
        companyId: request.companyId,
        actorId: input.session.userId,
        action: 'governance.approval.cancelled',
        targetType: 'governance-approval',
        targetId: request.id,
        result: 'SUCCEEDED',
        correlationId: crypto.randomUUID(),
        safeMetadata: { actionType: request.actionType },
      },
    });
  });
}

export async function expireStaleGovernanceApprovals(input: {
  actorId?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const prisma = await getPrisma();
  if (!prisma) throw new GovernanceApprovalError('APPROVAL_DATABASE_UNAVAILABLE');
  return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const stale = await transaction.governanceApprovalRequest.findMany({
      where: { status: { in: ['REQUESTED', 'APPROVED'] }, expiresAt: { lte: now } },
      select: { id: true, companyId: true, actionType: true },
    });
    for (const request of stale) {
      const changed = await transaction.governanceApprovalRequest.updateMany({
        where: {
          id: request.id,
          status: { in: ['REQUESTED', 'APPROVED'] },
          expiresAt: { lte: now },
        },
        data: { status: 'EXPIRED' },
      });
      if (changed.count !== 1) continue;
      await transaction.productionAuditEvent.create({
        data: {
          id: crypto.randomUUID(),
          companyId: request.companyId,
          actorId: input.actorId ?? null,
          action: 'governance.approval.expired',
          targetType: 'governance-approval',
          targetId: request.id,
          result: 'SUCCEEDED',
          correlationId: crypto.randomUUID(),
          safeMetadata: { actionType: request.actionType },
        },
      });
    }
    return { expired: stale.length, expiredAt: now };
  });
}

export async function executeGovernanceApproval<T>(input: {
  session: AppSession;
  requestId: string;
  executionKey: string;
  executionAuthorized: boolean;
  expectedActionType: GovernanceApprovalAction;
  currentResourceVersion?: number | null;
  now?: Date;
  execute: (
    transaction: Prisma.TransactionClient,
    request: {
      id: string;
      companyId: string | null;
      resourceId: string | null;
      safeParameters: SafeParameters;
    },
  ) => Promise<T>;
}) {
  const now = input.now ?? new Date();
  requireStepUp(input.session, now);
  if (!input.executionAuthorized) throw new GovernanceApprovalError('EXECUTION_PERMISSION_DENIED');
  const prisma = await getPrisma();
  if (!prisma) throw new GovernanceApprovalError('APPROVAL_DATABASE_UNAVAILABLE');
  const executionCandidate = await prisma.governanceApprovalRequest.findUnique({
    where: { id: input.requestId },
    select: { expiresAt: true, status: true },
  });
  if (executionCandidate?.status === 'APPROVED' && executionCandidate.expiresAt <= now) {
    await prisma.governanceApprovalRequest.updateMany({
      where: { id: input.requestId, status: 'APPROVED' },
      data: { status: 'EXPIRED' },
    });
    throw new GovernanceApprovalError('APPROVAL_EXPIRED');
  }
  return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const request = await transaction.governanceApprovalRequest.findUnique({
      where: { id: input.requestId },
      include: { decisions: true },
    });
    if (!request || request.actionType !== input.expectedActionType) {
      throw new GovernanceApprovalError('APPROVAL_NOT_FOUND');
    }
    if (request.scope === 'ORGANIZATION' && request.companyId !== input.session.companyId) {
      throw new GovernanceApprovalError('APPROVAL_SCOPE_MISMATCH');
    }
    if (request.requesterId !== input.session.userId) {
      throw new GovernanceApprovalError('EXECUTION_REQUESTER_MISMATCH');
    }
    if (request.status !== 'APPROVED') throw new GovernanceApprovalError('APPROVAL_NOT_APPROVED');
    if (request.expiresAt <= now) throw new GovernanceApprovalError('APPROVAL_EXPIRED');
    const approvalPolicy = getGovernanceApprovalPolicy(request.actionType);
    const validApprovers = new Set(
      request.decisions
        .filter(
          (decision: { approved: boolean; approverId: string }) =>
            decision.approved && decision.approverId !== request.requesterId,
        )
        .map((decision: { approverId: string }) => decision.approverId),
    );
    if (!approvalPolicy || validApprovers.size < approvalPolicy.minimumApprovals) {
      throw new GovernanceApprovalError('APPROVAL_DECISIONS_INVALID');
    }
    if (
      request.expectedVersion !== null &&
      request.expectedVersion !== input.currentResourceVersion
    ) {
      throw new GovernanceApprovalError('RESOURCE_VERSION_CHANGED');
    }
    const safeParameters = asSafeParameters(request.safeParameters);
    const fingerprint = governanceApprovalFingerprint({
      actionType: request.actionType,
      scope: request.scope,
      companyId: request.companyId,
      resourceId: request.resourceId,
      expectedVersion: request.expectedVersion,
      safeParameters,
      requesterId: request.requesterId,
      expiresAt: request.expiresAt,
    });
    if (fingerprint !== request.payloadFingerprint) {
      throw new GovernanceApprovalError('APPROVAL_PAYLOAD_CHANGED');
    }
    // Claim the approval before invoking the executor. The claim and the action share one
    // transaction, so a failed executor rolls the claim back, while concurrent/replayed
    // executions observe a non-APPROVED row and cannot perform the side effect twice.
    const claimed = await transaction.governanceApprovalRequest.updateMany({
      where: { id: request.id, status: 'APPROVED', executionKey: null },
      data: { status: 'EXECUTED', executedAt: now, executionKey: input.executionKey },
    });
    if (claimed.count !== 1) throw new GovernanceApprovalError('APPROVAL_REPLAY_DENIED');
    const result = await input.execute(transaction, {
      id: request.id,
      companyId: request.companyId,
      resourceId: request.resourceId,
      safeParameters,
    });
    await transaction.productionAuditEvent.create({
      data: {
        id: crypto.randomUUID(),
        companyId: request.companyId,
        actorId: input.session.userId,
        action: 'governance.approval.executed',
        targetType: 'governance-approval',
        targetId: request.id,
        result: 'SUCCEEDED',
        correlationId: crypto.randomUUID(),
        safeMetadata: { actionType: request.actionType },
      },
    });
    const executionRecipients = [
      ...new Set([
        request.requesterId,
        ...request.decisions.map((decision: { approverId: string }) => decision.approverId),
      ]),
    ];
    if (request.scope === 'ORGANIZATION' && request.companyId) {
      await transaction.portalNotification.createMany({
        data: executionRecipients.map((userId) => ({
          userId,
          companyId: request.companyId!,
          category: 'SECURITY',
          title: 'Критическое действие выполнено',
          href: '/portal/settings/security/audit',
        })),
      });
    } else {
      await transaction.governanceNotification.createMany({
        data: executionRecipients.map((recipientId) => ({
          recipientId,
          companyId: request.companyId,
          category: 'GOVERNANCE_APPROVAL',
          title: 'Критическое действие выполнено',
          href: '/portal/platform/approvals',
        })),
      });
    }
    return result;
  });
}
