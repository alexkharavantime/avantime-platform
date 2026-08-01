import { NextResponse } from 'next/server';

import { executeGovernanceApproval } from '../../../../../lib/governance-approvals';
import { authorizePlatformApi } from '../../../../../lib/platform-authorization';

export async function POST(request: Request) {
  const authorization = await authorizePlatformApi('platform.audit.export');
  if (authorization.response) return authorization.response;
  const body = (await request.json().catch(() => null)) as { approvalId?: unknown } | null;
  if (typeof body?.approvalId !== 'string') {
    return NextResponse.json({ error: 'Требуется controlled approval.' }, { status: 403 });
  }
  try {
    const events = await executeGovernanceApproval({
      session: authorization.session,
      requestId: body.approvalId,
      executionKey: `platform-audit-export:${body.approvalId}`,
      executionAuthorized: true,
      expectedActionType: 'PLATFORM_AUDIT_EXPORT',
      execute: async (transaction, approval) => {
        if (approval.companyId || approval.resourceId) throw new Error('APPROVAL_TARGET_CHANGED');
        const from = new Date(String(approval.safeParameters.from));
        const to = new Date(String(approval.safeParameters.to));
        if (
          approval.safeParameters.format !== 'json' ||
          !Number.isFinite(from.getTime()) ||
          !Number.isFinite(to.getTime()) ||
          from > to
        ) {
          throw new Error('APPROVAL_PARAMETERS_INVALID');
        }
        return transaction.productionAuditEvent.findMany({
          where: { occurredAt: { gte: from, lte: to } },
          orderBy: { occurredAt: 'desc' },
          take: 500,
        });
      },
    });
    return NextResponse.json({ events }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Approval execution отклонён.' }, { status: 409 });
  }
}
