import { getPrisma } from '@avantime/database';
import { NextResponse } from 'next/server';

import { authorizeSession } from './authorization';
import {
  getSession,
  type AppSession,
  type MembershipStatus,
  type OrganizationRole,
} from './session';

type PortalIdentity = {
  id: string;
  email: string;
  role: 'CLIENT' | 'ADMIN';
  active: boolean;
  disabledAt?: Date | null;
  memberships: Array<{
    companyId: string;
    active: boolean;
    organizationRole?: OrganizationRole;
    status?: MembershipStatus;
    version?: number;
  }>;
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
    select: {
      id: true,
      email: true,
      role: true,
      active: true,
      disabledAt: true,
      memberships: {
        where: { active: true, status: 'ACTIVE' },
        select: {
          companyId: true,
          active: true,
          organizationRole: true,
          status: true,
          version: true,
        },
      },
    },
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
      identity.disabledAt ||
      identity.email.toLowerCase() !== authorization.session.email.toLowerCase() ||
      identity.role !== authorization.session.role ||
      (authorization.session.companyId
        ? !identity.memberships.some(
            (membership) =>
              membership.active &&
              (membership.status === 'ACTIVE' ||
                (membership.status === undefined && membership.active)) &&
              membership.companyId === authorization.session.companyId &&
              (!authorization.session.organizationRole ||
                (membership.organizationRole ??
                  (identity.role === 'ADMIN' ? 'ADMIN' : 'MEMBER')) ===
                  authorization.session.organizationRole) &&
              (!authorization.session.membershipVersion ||
                (membership.version ?? 1) === authorization.session.membershipVersion),
          )
        : authorization.session.role === 'CLIENT')
    ) {
      return null;
    }
    const membership = authorization.session.companyId
      ? identity.memberships.find(
          (candidate) => candidate.companyId === authorization.session.companyId,
        )
      : undefined;
    return membership
      ? {
          ...authorization.session,
          organizationRole:
            membership.organizationRole ?? (identity.role === 'ADMIN' ? 'ADMIN' : 'MEMBER'),
          membershipStatus: membership.status ?? (membership.active ? 'ACTIVE' : 'SUSPENDED'),
          membershipVersion: membership.version ?? 1,
        }
      : authorization.session;
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
