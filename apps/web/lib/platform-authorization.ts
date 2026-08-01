import { getPrisma } from '@avantime/database';
import { NextResponse } from 'next/server';

import { getSession, type AppSession } from './session';
import {
  evaluatePlatformPermission,
  type PlatformOperationalContext,
  type PlatformPermission,
  type PlatformSupportSessionContext,
} from './platform-permissions';

type PlatformAuthorization =
  | { session: AppSession; assignmentId: string; response?: never }
  | { session?: never; assignmentId?: never; response: NextResponse };

export async function authorizePlatformSession(
  session: AppSession | null,
  permission: PlatformPermission,
  options: {
    operationalContext?: PlatformOperationalContext;
    supportSession?: PlatformSupportSessionContext | null;
  } = {},
): Promise<PlatformAuthorization> {
  if (!session) {
    return {
      response: NextResponse.json({ error: 'Требуется авторизация.' }, { status: 401 }),
    };
  }
  const prisma = await getPrisma();
  if (!prisma) {
    return {
      response: NextResponse.json({ error: 'Проверка прав временно недоступна.' }, { status: 503 }),
    };
  }
  const assignments = await prisma.platformRoleAssignment.findMany({
    where: { userId: session.userId, active: true, disabledAt: null },
    orderBy: { createdAt: 'asc' },
  });
  for (const assignment of assignments) {
    const decision = evaluatePlatformPermission({
      session,
      assignment,
      permission,
      operationalContext: options.operationalContext,
      supportSession: options.supportSession,
    });
    if (decision.allowed) return { session, assignmentId: assignment.id };
  }
  return {
    response: NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 }),
  };
}

export async function authorizePlatformApi(
  permission: PlatformPermission,
  options?: Parameters<typeof authorizePlatformSession>[2],
) {
  return authorizePlatformSession(await getSession(), permission, options);
}

export async function hasPlatformPermission(
  session: AppSession | null,
  permission: PlatformPermission,
) {
  const result = await authorizePlatformSession(session, permission);
  return !result.response;
}
