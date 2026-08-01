import { NextResponse } from 'next/server';

import { executeGovernanceApproval } from '../../../../../lib/governance-approvals';
import { authorizeOrganizationApi } from '../../../../../lib/organization-authorization';
import { listOrganizationAudit } from '../../../../../lib/organization-audit';

export async function GET(request: Request) {
  const authorization = await authorizeOrganizationApi('identity.audit.view', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json({ events: await listOrganizationAudit(authorization.session) });
  } catch {
    return NextResponse.json({ error: 'Аудит временно недоступен.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeOrganizationApi('organization.export', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const body = (await request.json()) as { approvalId?: unknown; companyId?: unknown };
  if (body.companyId !== undefined) {
    return NextResponse.json(
      { error: 'Поле companyId не поддерживается.', code: 'TENANT_INPUT_REJECTED' },
      { status: 400 },
    );
  }
  if (typeof body.approvalId !== 'string') {
    return NextResponse.json({ error: 'Требуется controlled approval.' }, { status: 403 });
  }
  try {
    const events = await executeGovernanceApproval({
      session: authorization.session,
      requestId: body.approvalId,
      executionKey: `organization-audit-export:${body.approvalId}`,
      executionAuthorized: true,
      expectedActionType: 'ORGANIZATION_AUDIT_EXPORT',
      execute: async (transaction, approval) => {
        if (
          approval.companyId !== authorization.session.companyId ||
          approval.resourceId !== authorization.session.companyId
        ) {
          throw new Error('APPROVAL_TARGET_CHANGED');
        }
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
          where: {
            companyId: authorization.session.companyId,
            occurredAt: { gte: from, lte: to },
          },
          orderBy: { occurredAt: 'desc' },
          take: 500,
        });
      },
    });
    return NextResponse.json({ events }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Экспорт аудита временно недоступен.' }, { status: 503 });
  }
}
