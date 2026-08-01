import { NextResponse } from 'next/server';

import { getSession, type AppSession, type UserRole } from './session';

type ApiAuthorization =
  { session: AppSession; response?: never } | { session?: never; response: NextResponse };

export function authorizeSession(
  session: AppSession | null,
  roles?: readonly UserRole[],
): ApiAuthorization {
  if (roles && process.env.NODE_ENV !== 'production') {
    console.warn(`Legacy role authorization compatibility used: ${roles.join(',')}.`);
  }
  if (!session) {
    return {
      response: NextResponse.json({ error: 'Требуется авторизация.' }, { status: 401 }),
    };
  }

  if (roles && !roles.includes(session.role)) {
    return {
      response: NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 }),
    };
  }

  return { session };
}

export async function authorizeApi(roles?: readonly UserRole[]): Promise<ApiAuthorization> {
  return authorizeSession(await getSession(), roles);
}

export function canAccessCompany(session: AppSession, companyId?: string | null) {
  if (session.role === 'ADMIN') return true;
  return Boolean(session.companyId && companyId && session.companyId === companyId);
}
