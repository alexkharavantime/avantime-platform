import { NextResponse } from 'next/server';

import { cancelGovernanceApproval } from '../../../../../lib/governance-approvals';
import { governanceMutationOriginAllowed } from '../../../../../lib/governance-request-security';
import { getSession } from '../../../../../lib/session';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!governanceMutationOriginAllowed(request))
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Требуется авторизация.' }, { status: 401 });
  try {
    await cancelGovernanceApproval({ session, requestId: (await params).id });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Approval request не отменён.' }, { status: 409 });
  }
}
