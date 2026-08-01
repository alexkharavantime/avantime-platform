import { NextResponse } from 'next/server';

import { cancelGovernanceApproval } from '../../../../../lib/governance-approvals';
import { getSession } from '../../../../../lib/session';

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Требуется авторизация.' }, { status: 401 });
  try {
    await cancelGovernanceApproval({ session, requestId: (await params).id });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Approval request не отменён.' }, { status: 409 });
  }
}
