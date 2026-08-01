import { NextResponse } from 'next/server';

import { authorizePlatformApi } from '../../../../../lib/platform-authorization';
import { changePlatformRoleAssignment } from '../../../../../lib/platform-role-governance';

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const authorization = await authorizePlatformApi('platform.roles.manage');
  if (authorization.response) return authorization.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.role !== 'string' ||
    typeof body.active !== 'boolean' ||
    !Number.isSafeInteger(body.expectedVersion) ||
    typeof body.confirmation !== 'string'
  ) {
    return NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 });
  }
  try {
    const assignment = await changePlatformRoleAssignment({
      session: authorization.session,
      targetUserId: (await params).userId,
      role: body.role,
      active: body.active,
      expectedVersion: body.expectedVersion as number,
      confirmation: body.confirmation,
    });
    return NextResponse.json({
      id: assignment.id,
      role: assignment.role,
      active: assignment.active,
      version: assignment.version,
    });
  } catch {
    return NextResponse.json({ error: 'Platform role не изменена.' }, { status: 409 });
  }
}
