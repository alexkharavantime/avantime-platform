import { getPrisma } from '@avantime/database';
import { NextResponse } from 'next/server';

import { authorizeGovernanceApprovalPolicy } from '../../../../lib/governance-approval-authorization';
import {
  getGovernanceApprovalPolicy,
  governanceApprovalExecutorConnected,
  type GovernanceApprovalAction,
  type GovernanceScope,
} from '../../../../lib/governance-approval-policy';
import { requestGovernanceApproval } from '../../../../lib/governance-approvals';
import { governanceMutationOriginAllowed } from '../../../../lib/governance-request-security';
import { authorizePlatformSession } from '../../../../lib/platform-authorization';
import { getSession } from '../../../../lib/session';
import { loadPlatformSupportSession } from '../../../../lib/platform-support';

type SafeParameters = Record<string, string | number | boolean | null>;
const SUPPORT_REQUEST_STATUSES = new Set(['NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED']);

async function resolveApprovalTarget(input: {
  actionType: GovernanceApprovalAction;
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  body: Record<string, unknown>;
  safeParameters: Record<string, unknown>;
  supportSession: Awaited<ReturnType<typeof loadPlatformSupportSession>>;
}): Promise<{
  companyId: string | null;
  resourceId: string | null;
  expectedVersion: number | null;
  safeParameters: SafeParameters;
}> {
  const prisma = await getPrisma();
  if (!prisma) throw new Error('APPROVAL_DATABASE_UNAVAILABLE');
  if (
    input.actionType === 'PLATFORM_OWNER_ASSIGN' ||
    input.actionType === 'PLATFORM_OWNER_REMOVE'
  ) {
    if (typeof input.body.resourceId !== 'string') throw new Error('APPROVAL_TARGET_INVALID');
    const target = await prisma.user.findUnique({
      where: { id: input.body.resourceId },
      select: { id: true, active: true, disabledAt: true },
    });
    if (!target?.active || target.disabledAt) throw new Error('APPROVAL_TARGET_INVALID');
    const assignment = await prisma.platformRoleAssignment.findUnique({
      where: { userId_role: { userId: target.id, role: 'PLATFORM_OWNER' } },
      select: { version: true },
    });
    const version = assignment?.version ?? 0;
    if (
      input.body.expectedVersion !== version ||
      input.safeParameters.targetUserId !== target.id ||
      input.safeParameters.assignmentVersion !== version
    ) {
      throw new Error('APPROVAL_TARGET_CHANGED');
    }
    return {
      companyId: null,
      resourceId: target.id,
      expectedVersion: version,
      safeParameters: { targetUserId: target.id, assignmentVersion: version },
    };
  }
  if (input.actionType === 'PLATFORM_AUDIT_EXPORT') {
    if (input.body.resourceId !== undefined || input.body.expectedVersion !== undefined) {
      throw new Error('APPROVAL_TARGET_INVALID');
    }
    return {
      companyId: null,
      resourceId: null,
      expectedVersion: null,
      safeParameters: input.safeParameters as SafeParameters,
    };
  }
  if (input.actionType === 'ORGANIZATION_AUDIT_EXPORT') {
    if (
      !input.session.companyId ||
      input.body.resourceId !== undefined ||
      input.body.expectedVersion !== undefined
    ) {
      throw new Error('APPROVAL_TARGET_INVALID');
    }
    return {
      companyId: input.session.companyId,
      resourceId: input.session.companyId,
      expectedVersion: null,
      safeParameters: input.safeParameters as SafeParameters,
    };
  }
  if (input.actionType === 'KNOWLEDGE_VISIBILITY_PUBLIC') {
    if (!input.session.companyId || typeof input.body.resourceId !== 'string') {
      throw new Error('APPROVAL_TARGET_INVALID');
    }
    const article = await prisma.knowledgeArticle.findFirst({
      where: {
        id: input.body.resourceId,
        companyId: input.session.companyId,
        ownerScope: 'ORGANIZATION',
        quarantinedAt: null,
      },
      select: { id: true, companyId: true, version: true },
    });
    if (
      !article ||
      input.body.expectedVersion !== article.version ||
      input.safeParameters.articleId !== article.id ||
      input.safeParameters.articleVersion !== article.version
    ) {
      throw new Error('APPROVAL_TARGET_CHANGED');
    }
    return {
      companyId: article.companyId,
      resourceId: article.id,
      expectedVersion: article.version,
      safeParameters: { articleId: article.id, articleVersion: article.version },
    };
  }
  if (input.actionType === 'CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION') {
    const operation = input.safeParameters.operation;
    const nextStatus =
      typeof operation === 'string' && operation.startsWith('REQUEST_STATUS_CHANGE:')
        ? operation.slice('REQUEST_STATUS_CHANGE:'.length)
        : '';
    if (
      !input.supportSession ||
      typeof input.body.resourceId !== 'string' ||
      input.safeParameters.supportSessionId !== input.supportSession.id ||
      input.safeParameters.resourceId !== input.body.resourceId ||
      input.safeParameters.resourceVersion !== input.body.expectedVersion ||
      typeof operation !== 'string' ||
      !SUPPORT_REQUEST_STATUSES.has(nextStatus)
    ) {
      throw new Error('APPROVAL_TARGET_CHANGED');
    }
    const supportRequest = await prisma.supportRequest.findFirst({
      where: { publicId: input.body.resourceId, companyId: input.supportSession.companyId },
      select: { publicId: true, version: true },
    });
    if (!supportRequest || supportRequest.version !== input.body.expectedVersion) {
      throw new Error('APPROVAL_TARGET_CHANGED');
    }
    return {
      companyId: input.supportSession.companyId,
      resourceId: supportRequest.publicId,
      expectedVersion: supportRequest.version,
      safeParameters: {
        supportSessionId: input.supportSession.id,
        operation,
        resourceId: supportRequest.publicId,
        resourceVersion: supportRequest.version,
      },
    };
  }
  // Registry-only actions remain fail-closed until their dedicated resource resolver and
  // executor are connected. Persisting an unexecutable approval would create false evidence.
  throw new Error('APPROVAL_EXECUTOR_UNAVAILABLE');
}

export async function POST(request: Request) {
  if (!governanceMutationOriginAllowed(request))
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const policy =
    body && typeof body.actionType === 'string'
      ? getGovernanceApprovalPolicy(body.actionType)
      : null;
  if (
    !body ||
    !policy ||
    !governanceApprovalExecutorConnected(body.actionType as string) ||
    body.scope !== policy.scope ||
    typeof body.confirmation !== 'string' ||
    !body.safeParameters ||
    Array.isArray(body.safeParameters) ||
    typeof body.safeParameters !== 'object'
  ) {
    return NextResponse.json({ error: 'Некорректный approval request.' }, { status: 400 });
  }
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Требуется авторизация.' }, { status: 401 });
    }
    const supportSession =
      body.actionType === 'CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION' &&
      typeof (body.safeParameters as Record<string, unknown>).supportSessionId === 'string'
        ? await loadPlatformSupportSession({
            actorId: session.userId,
            supportSessionId: (body.safeParameters as Record<string, string>).supportSessionId,
          })
        : null;
    if (body.actionType === 'CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION' && !supportSession) {
      return NextResponse.json({ error: 'Требуется active support session.' }, { status: 403 });
    }
    const authorization =
      body.actionType === 'CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION'
        ? await authorizePlatformSession(session, 'platform.support.action.execute', {
            operationalContext: {
              companyId: supportSession!.companyId,
              targetType: 'support-action',
              targetId: typeof body.resourceId === 'string' ? body.resourceId : null,
              requireSupportSession: true,
            },
            supportSession,
          })
        : await authorizeGovernanceApprovalPolicy(session, policy);
    if (authorization.response) return authorization.response;
    const target = await resolveApprovalTarget({
      actionType: body.actionType as GovernanceApprovalAction,
      session: authorization.session,
      body,
      safeParameters: body.safeParameters as Record<string, unknown>,
      supportSession,
    });
    const approval = await requestGovernanceApproval({
      session: authorization.session,
      actionType: body.actionType as GovernanceApprovalAction,
      scope: body.scope as GovernanceScope,
      companyId: target.companyId,
      resourceId: target.resourceId,
      expectedVersion: target.expectedVersion,
      safeParameters: target.safeParameters,
      confirmation: body.confirmation,
    });
    return NextResponse.json(
      { id: approval.id, status: approval.status, expiresAt: approval.expiresAt },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Approval request не создан.' }, { status: 403 });
  }
}
