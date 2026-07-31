import { createHash, randomBytes } from 'node:crypto';
import { getPrisma } from '@avantime/database';
import { cookies } from 'next/headers';

import { SESSION_COOKIE } from './session-constants';

export { SESSION_COOKIE };
export type PlatformRole = 'CLIENT' | 'ADMIN';
export type UserRole = PlatformRole;
export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER';
export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'REMOVED';

export const SESSION_ABSOLUTE_TTL_SECONDS = 60 * 60 * 8;
export const SESSION_IDLE_TTL_SECONDS = 60 * 30;
const SESSION_ACTIVITY_WRITE_INTERVAL_MS = 60_000;
const SESSION_TOKEN_PREFIX = 'ats_';

export type AppSession = {
  sessionId?: string;
  userId: string;
  name: string;
  company: string;
  companyId?: string;
  identityProviderId?: string;
  email: string;
  role: PlatformRole;
  organizationRole?: OrganizationRole;
  membershipStatus?: MembershipStatus;
  membershipVersion?: number;
  mfaSatisfied?: boolean;
  authenticationAt?: number;
  expiresAt: number;
};

export type SessionIdentity = Omit<AppSession, 'expiresAt' | 'sessionId'>;

type StoredMemorySession = {
  id: string;
  tokenHash: string;
  identity: SessionIdentity;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  idleExpiresAt: number;
  revokedAt?: number;
  deviceLabel?: string;
};

const developmentSessions = new Map<string, StoredMemorySession>();

export function getSessionSecret(environment: Record<string, string | undefined> = process.env) {
  const value = environment.SESSION_SECRET?.trim();

  if (!value) {
    throw new Error(
      'SESSION_SECRET is required. Configure a unique secret with at least 32 characters.',
    );
  }

  if (value.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }

  return value;
}

if (process.env.NODE_ENV === 'production') {
  getSessionSecret();
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueSessionToken() {
  return `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function sessionCookieOptions(environment = process.env) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: environment.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_ABSOLUTE_TTL_SECONDS,
  };
}

export function expiredSessionCookieOptions(environment = process.env) {
  return {
    ...sessionCookieOptions(environment),
    maxAge: 0,
  };
}

export function coarseDeviceLabel(userAgent: string | null | undefined) {
  const value = userAgent?.toLowerCase() ?? '';
  const browser = value.includes('edg/')
    ? 'Edge'
    : value.includes('firefox/')
      ? 'Firefox'
      : value.includes('chrome/') || value.includes('chromium/')
        ? 'Chromium'
        : value.includes('safari/')
          ? 'Safari'
          : 'Unknown browser';
  const platform = value.includes('android')
    ? 'Android'
    : value.includes('iphone') || value.includes('ipad')
      ? 'iOS'
      : value.includes('windows')
        ? 'Windows'
        : value.includes('mac os')
          ? 'macOS'
          : value.includes('linux')
            ? 'Linux'
            : 'Unknown device';
  return `${browser} · ${platform}`;
}

function toAppSession(
  row: {
    id: string;
    companyId: string | null;
    identityProviderId: string | null;
    expiresAt: Date;
    authenticationAt: Date;
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      active: boolean;
      disabledAt: Date | null;
      company: { name: string } | null;
      memberships: Array<{
        companyId: string;
        active: boolean;
        organizationRole: OrganizationRole;
        status: MembershipStatus;
        version: number;
        company: { name: string };
      }>;
    };
  },
  mfaSatisfied = true,
): AppSession | null {
  if (!row.user.active || row.user.disabledAt) return null;
  const membership = row.companyId
    ? row.user.memberships.find(
        (candidate) =>
          candidate.active &&
          candidate.status === 'ACTIVE' &&
          candidate.companyId === row.companyId,
      )
    : undefined;
  if (row.user.role === 'CLIENT' && !membership) return null;
  return {
    sessionId: row.id,
    userId: row.user.id,
    name: row.user.name,
    company: membership?.company.name ?? row.user.company?.name ?? 'Avantime',
    companyId: membership?.companyId,
    identityProviderId: row.identityProviderId ?? undefined,
    email: row.user.email,
    role: row.user.role,
    organizationRole: membership?.organizationRole,
    membershipStatus: membership?.status,
    membershipVersion: membership?.version,
    mfaSatisfied,
    authenticationAt: row.authenticationAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
  };
}

export async function createUserSession(
  identity: SessionIdentity,
  options: {
    userAgent?: string | null;
    previousToken?: string | null;
    now?: Date;
    databaseConfigured?: boolean;
  } = {},
) {
  const now = options.now ?? new Date();
  const token = createOpaqueSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_TTL_SECONDS * 1000);
  const idleExpiresAt = new Date(now.getTime() + SESSION_IDLE_TTL_SECONDS * 1000);
  const deviceLabel = coarseDeviceLabel(options.userAgent);
  const databaseConfigured = options.databaseConfigured ?? Boolean(process.env.DATABASE_URL);

  if (databaseConfigured) {
    const prisma = await getPrisma();
    if (!prisma) throw new Error('Session database is unavailable.');
    const user = await prisma.user.findUnique({
      where: { id: identity.userId },
      select: {
        email: true,
        role: true,
        active: true,
        disabledAt: true,
        memberships: {
          where: { active: true, status: 'ACTIVE' },
          select: {
            companyId: true,
            organizationRole: true,
            status: true,
            version: true,
          },
        },
      },
    });
    if (
      !user?.active ||
      user.disabledAt ||
      user.email.toLowerCase() !== identity.email.toLowerCase() ||
      user.role !== identity.role ||
      (identity.companyId &&
        !user.memberships.some(
          (membership: {
            companyId: string;
            organizationRole: OrganizationRole;
            status: MembershipStatus;
            version: number;
          }) =>
            membership.companyId === identity.companyId &&
            membership.status === 'ACTIVE' &&
            (!identity.organizationRole ||
              membership.organizationRole === identity.organizationRole) &&
            (!identity.membershipVersion || membership.version === identity.membershipVersion),
        )) ||
      (identity.role === 'CLIENT' && !identity.companyId)
    ) {
      throw new Error('Session identity is no longer active.');
    }
    if (identity.identityProviderId) {
      const provider = await prisma.identityProvider.findFirst({
        where: {
          id: identity.identityProviderId,
          companyId: identity.companyId,
          kind: 'OIDC',
          enabled: true,
          validationStatus: 'TENANT_VALIDATED',
        },
        select: { id: true },
      });
      if (!provider) throw new Error('External identity provider is no longer active.');
    }
    let rotatedFromId: string | undefined;
    if (options.previousToken) {
      const previousHash = hashSessionToken(options.previousToken);
      const previous = await prisma.userSession.findUnique({
        where: { tokenHash: previousHash },
        select: { id: true, userId: true },
      });
      if (previous) {
        if (previous.userId === identity.userId) rotatedFromId = previous.id;
        await prisma.userSession.update({
          where: { id: previous.id },
          data: { revokedAt: now },
        });
      }
    }
    const row = await prisma.userSession.create({
      data: {
        tokenHash,
        userId: identity.userId,
        companyId: identity.companyId ?? null,
        identityProviderId: identity.identityProviderId ?? null,
        expiresAt,
        idleExpiresAt,
        rotatedFromId,
        deviceLabel,
        authenticationAt: new Date(identity.authenticationAt ?? now.getTime()),
      },
      select: { id: true },
    });
    return { token, sessionId: row.id as string, expiresAt };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Production sessions require PostgreSQL.');
  }
  const id = crypto.randomUUID();
  developmentSessions.set(tokenHash, {
    id,
    tokenHash,
    identity,
    createdAt: now.getTime(),
    lastActivityAt: now.getTime(),
    expiresAt: expiresAt.getTime(),
    idleExpiresAt: idleExpiresAt.getTime(),
    deviceLabel,
  });
  return { token, sessionId: id, expiresAt };
}

async function resolveDatabaseSession(tokenHash: string, now: Date): Promise<AppSession | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const row = await prisma.userSession.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          company: { select: { name: true } },
          memberships: {
            where: { active: true, status: 'ACTIVE' },
            include: { company: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!row || row.revokedAt || row.expiresAt <= now || row.idleExpiresAt <= now) {
    return null;
  }

  if (now.getTime() - row.lastActivityAt.getTime() >= SESSION_ACTIVITY_WRITE_INTERVAL_MS) {
    const nextIdleExpiry = new Date(
      Math.min(row.expiresAt.getTime(), now.getTime() + SESSION_IDLE_TTL_SECONDS * 1000),
    );
    await prisma.userSession.updateMany({
      where: {
        id: row.id,
        revokedAt: null,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
      },
      data: { lastActivityAt: now, idleExpiresAt: nextIdleExpiry },
    });
  }
  return toAppSession(row);
}

function resolveMemorySession(tokenHash: string, now: Date): AppSession | null {
  const row = developmentSessions.get(tokenHash);
  if (
    !row ||
    row.revokedAt ||
    row.expiresAt <= now.getTime() ||
    row.idleExpiresAt <= now.getTime()
  ) {
    developmentSessions.delete(tokenHash);
    return null;
  }
  row.lastActivityAt = now.getTime();
  row.idleExpiresAt = Math.min(row.expiresAt, now.getTime() + SESSION_IDLE_TTL_SECONDS * 1000);
  return {
    ...row.identity,
    sessionId: row.id,
    expiresAt: row.expiresAt,
  };
}

export async function resolveSessionToken(
  token: string,
  options: { now?: Date; databaseConfigured?: boolean } = {},
) {
  if (!token.startsWith(SESSION_TOKEN_PREFIX)) return null;
  const tokenHash = hashSessionToken(token);
  const now = options.now ?? new Date();
  const databaseConfigured = options.databaseConfigured ?? Boolean(process.env.DATABASE_URL);
  try {
    return databaseConfigured
      ? await resolveDatabaseSession(tokenHash, now)
      : resolveMemorySession(tokenHash, now);
  } catch {
    console.warn('Session validation is temporarily unavailable.');
    return null;
  }
}

export async function revokeSessionToken(token: string) {
  const tokenHash = hashSessionToken(token);
  if (process.env.DATABASE_URL) {
    const prisma = await getPrisma();
    await prisma?.userSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return;
  }
  const item = developmentSessions.get(tokenHash);
  if (item) item.revokedAt = Date.now();
}

export async function revokeAllUserSessions(userId: string, exceptSessionId?: string) {
  const prisma = await getPrisma();
  if (prisma) {
    return prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }
  for (const session of developmentSessions.values()) {
    if (session.identity.userId === userId && session.id !== exceptSessionId) {
      session.revokedAt = Date.now();
    }
  }
  return { count: 0 };
}

export async function getSession(): Promise<AppSession | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  return raw ? resolveSessionToken(raw) : null;
}

export function resetMemorySessionsForTests() {
  developmentSessions.clear();
}
