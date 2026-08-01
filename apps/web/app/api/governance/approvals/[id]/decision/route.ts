import { getPrisma } from '@avantime/database';
import { NextResponse } from 'next/server';

import { authorizeGovernanceApprovalPolicy } from '../../../../../../lib/governance-approval-authorization';
import { getGovernanceApprovalPolicy } from '../../../../../../lib/governance-approval-policy';
import { decideGovernanceApproval } from '../../../../../../lib/governance-approvals';
import { governanceMutationOriginAllowed } from '../../../../../../lib/governance-request-security';
import { getSession } from '../../../../../../lib/session';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!governanceMutationOriginAllowed(request))
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { approved?: unknown } | null;
  if (typeof body?.approved !== 'boolean')
    return NextResponse.json({ error: 'Некорректное решение.' }, { status: 400 });
  const prisma = await getPrisma();
  const approval = prisma
    ? await prisma.governanceApprovalRequest.findUnique({
        where: { id: (await params).id },
        select: { actionType: true },
      })
    : null;
  const policy = approval ? getGovernanceApprovalPolicy(approval.actionType) : null;
  if (!policy) return NextResponse.json({ error: 'Approval request не найден.' }, { status: 404 });
  const session = await getSession();
  const authorization = await authorizeGovernanceApprovalPolicy(session, policy);
  if (authorization.response) return authorization.response;
  try {
    const result = await decideGovernanceApproval({
      session: authorization.session,
      requestId: (await params).id,
      approved: body.approved,
      approverAuthorized: true,
    });
    return NextResponse.json({ id: result.id, status: result.status });
  } catch {
    return NextResponse.json({ error: 'Решение не принято.' }, { status: 409 });
  }
}
