import { NextResponse } from 'next/server';

import { authorizePlatformApi } from '../../../../../../lib/platform-authorization';
import { executePlatformOwnerChange } from '../../../../../../lib/platform-role-governance';

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const authorization = await authorizePlatformApi('platform.roles.manage');
  if (authorization.response) return authorization.response;
  const body = (await request.json().catch(() => null)) as {
    approvalId?: unknown;
    action?: unknown;
  } | null;
  if (
    typeof body?.approvalId !== 'string' ||
    (body.action !== 'ASSIGN' && body.action !== 'REMOVE')
  ) {
    return NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 });
  }
  try {
    const assignment = await executePlatformOwnerChange({
      session: authorization.session,
      approvalId: body.approvalId,
      targetUserId: (await params).userId,
      action: body.action,
      authorized: true,
    });
    return NextResponse.json({
      id: assignment.id,
      role: assignment.role,
      active: assignment.active,
      version: assignment.version,
    });
  } catch {
    return NextResponse.json({ error: 'Platform owner change не выполнен.' }, { status: 409 });
  }
}
