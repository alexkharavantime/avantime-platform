import { NextResponse } from 'next/server';
import { executeGovernanceApproval } from '../../../../../../lib/governance-approvals';
import { governanceMutationOriginAllowed } from '../../../../../../lib/governance-request-security';
import { authorizePlatformSession } from '../../../../../../lib/platform-authorization';
import { loadPlatformSupportSession } from '../../../../../../lib/platform-support';
import { getSession } from '../../../../../../lib/session';
import { getRequest, type RequestStatus } from '../../../../../../lib/requests-store';

const allowed: RequestStatus[] = ['NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED'];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!governanceMutationOriginAllowed(request))
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  const body = (await request.json()) as { status?: RequestStatus; approvalId?: unknown };
  if (!body.status || !allowed.includes(body.status) || typeof body.approvalId !== 'string') {
    return NextResponse.json({ error: 'Некорректный статус.' }, { status: 400 });
  }

  const { id } = await context.params;
  const existing = await getRequest(id);
  if (!existing?.companyId)
    return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 });
  const session = await getSession();
  const supportSessionId = request.headers.get('x-avantime-support-session');
  const supportSession =
    session && supportSessionId
      ? await loadPlatformSupportSession({ actorId: session.userId, supportSessionId })
      : null;
  const authorization = await authorizePlatformSession(session, 'platform.support.action.execute', {
    operationalContext: {
      companyId: existing.companyId,
      targetType: 'request',
      targetId: id,
      requireSupportSession: true,
    },
    supportSession,
  });
  if (authorization.response) return authorization.response;
  try {
    const item = await executeGovernanceApproval({
      session: authorization.session,
      requestId: body.approvalId,
      executionKey: `support-request-status:${body.approvalId}`,
      executionAuthorized: true,
      expectedActionType: 'CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION',
      currentResourceVersion: existing.version,
      execute: async (transaction, approval) => {
        if (
          approval.companyId !== existing.companyId ||
          approval.resourceId !== id ||
          approval.safeParameters.supportSessionId !== supportSessionId ||
          approval.safeParameters.resourceId !== id ||
          approval.safeParameters.resourceVersion !== existing.version ||
          approval.safeParameters.operation !== `REQUEST_STATUS_CHANGE:${body.status}`
        ) {
          throw new Error('APPROVAL_TARGET_CHANGED');
        }
        const changed = await transaction.supportRequest.updateMany({
          where: { publicId: id, companyId: existing.companyId, version: existing.version },
          data: { status: body.status, version: { increment: 1 } },
        });
        if (changed.count !== 1) throw new Error('RESOURCE_VERSION_CHANGED');
        const updated = await transaction.supportRequest.findUniqueOrThrow({
          where: { publicId: id },
          select: { id: true, publicId: true, status: true, version: true },
        });
        await transaction.auditEvent.create({
          data: {
            requestId: updated.id,
            action: `Статус изменен: ${body.status}`,
            actorName: 'Platform support',
          },
        });
        return updated;
      },
    });
    return NextResponse.json({ request: item });
  } catch {
    return NextResponse.json({ error: 'Approval execution отклонён.' }, { status: 409 });
  }
}
