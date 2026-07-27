import { NextResponse } from 'next/server';

import { getSession, type AppSession, type UserRole } from './session';

type ApiAuthorization =
  | { session: AppSession; response?: never }
  | { session?: never; response: NextResponse };

export async function authorizeApi(roles?: readonly UserRole[]): Promise<ApiAuthorization> {
  const session = await getSession();

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

export function canAccessCompany(session: AppSession, companyId?: string | null) {
  if (session.role === 'ADMIN') return true;
  return Boolean(session.companyId && companyId && session.companyId === companyId);
}
