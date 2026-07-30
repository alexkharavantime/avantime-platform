import { getPrisma } from '@avantime/database';
import { NextResponse } from 'next/server';

import { authorizeSession } from './authorization';
import { getSession, type AppSession } from './session';

type PortalIdentity = {
  id: string;
  email: string;
  role: 'CLIENT' | 'ADMIN';
  active: boolean;
  companyId: string | null;
};

type PortalIdentityLoader = (userId: string) => Promise<PortalIdentity | null>;

export function authorizePortalSession(session: AppSession | null) {
  const authorization = authorizeSession(session);
  if (authorization.response) return authorization;
  if (authorization.session.role === 'CLIENT' && !authorization.session.companyId) {
    return {
      response: NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 }),
    };
  }
  return authorization;
}

async function loadPortalIdentity(userId: string): Promise<PortalIdentity | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, active: true, companyId: true },
  });
}

export async function validatePortalSession(
  session: AppSession | null,
  options: {
    databaseConfigured?: boolean;
    production?: boolean;
    loadIdentity?: PortalIdentityLoader;
  } = {},
): Promise<AppSession | null> {
  const authorization = authorizePortalSession(session);
  if (authorization.response || !authorization.session) return null;

  const databaseConfigured = options.databaseConfigured ?? Boolean(process.env.DATABASE_URL);
  const production = options.production ?? process.env.NODE_ENV === 'production';
  if (!databaseConfigured) return production ? null : authorization.session;

  try {
    const identity = await (options.loadIdentity ?? loadPortalIdentity)(
      authorization.session.userId,
    );
    if (
      !identity ||
      !identity.active ||
      identity.email.toLowerCase() !== authorization.session.email.toLowerCase() ||
      identity.role !== authorization.session.role ||
      (identity.companyId ?? undefined) !== authorization.session.companyId
    ) {
      return null;
    }
    return authorization.session;
  } catch {
    return null;
  }
}

export async function getValidatedPortalSession() {
  return validatePortalSession(await getSession());
}

export async function authorizePortalApi() {
  return authorizePortalSession(await getValidatedPortalSession());
}
