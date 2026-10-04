import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

import { getPrisma } from '@avantime/database';

import { normalizeIdentityEmail } from './identity-auth';
import {
  executePlatformOwnerBootstrap,
  hashBootstrapAuthorization,
} from './platform-owner-bootstrap';

const TARGET_EMAIL = 'alexander@solutions.lv';
const BOOTSTRAP_SINGLETON = 'first-platform-owner-v1';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const MAX_ACTIVATION_TTL_MS = 30 * 60_000;
const RECENT_AUTH_WINDOW_MS = 10 * 60_000;

export class LocalFirstOwnerSetupError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function validateLocalFirstOwnerEnvironment(
  environment: Record<string, string | undefined>,
  operation: 'prepare' | 'complete',
) {
  if (environment.NODE_ENV === 'production') {
    throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_PRODUCTION_DENIED');
  }
  if (environment.AUTH_ADMIN_MFA_REQUIRED !== 'true') {
    throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_MFA_ENFORCEMENT_REQUIRED');
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(environment.DATABASE_URL ?? '');
  } catch {
    throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_DATABASE_DENIED');
  }
  const databaseName = databaseUrl.pathname.replace(/^\/+/, '');
  if (
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    !LOCAL_HOSTS.has(databaseUrl.hostname.replace(/^\[|\]$/gu, '')) ||
    databaseName !== 'avantime'
  ) {
    throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_DATABASE_DENIED');
  }

  if (operation === 'prepare') {
    const encryptionKey = environment.MFA_ENCRYPTION_KEY ?? '';
    if (
      Buffer.from(encryptionKey, 'base64').length !== 32 ||
      !environment.MFA_ENCRYPTION_KEY_VERSION?.trim() ||
      (environment.SESSION_SECRET?.length ?? 0) < 32
    ) {
      throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_IDENTITY_CONFIGURATION_REQUIRED');
    }
    let appUrl: URL;
    try {
      appUrl = new URL(environment.APP_URL ?? '');
    } catch {
      throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_APP_URL_DENIED');
    }
    if (
      appUrl.protocol !== 'http:' ||
      !LOCAL_HOSTS.has(appUrl.hostname.replace(/^\[|\]$/gu, '')) ||
      appUrl.username ||
      appUrl.password ||
      appUrl.search ||
      appUrl.hash
    ) {
      throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_APP_URL_DENIED');
    }
    return { databaseName, appOrigin: appUrl.origin };
  }

  return { databaseName };
}

export async function prepareLocalFirstOwnerAccount(input: {
  email: string;
  token: string;
  expiresAt: Date;
  environment?: Record<string, string | undefined>;
  now?: Date;
}) {
  const environment = input.environment ?? process.env;
  validateLocalFirstOwnerEnvironment(environment, 'prepare');
  const emailNormalized = normalizeIdentityEmail(input.email);
  if (emailNormalized !== TARGET_EMAIL) {
    throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_TARGET_DENIED');
  }
  const now = input.now ?? new Date();
  if (
    input.token.length < 32 ||
    input.expiresAt <= now ||
    input.expiresAt.getTime() - now.getTime() > MAX_ACTIVATION_TTL_MS
  ) {
    throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_ACTIVATION_INVALID');
  }

  const prisma = await getPrisma();
  if (!prisma) throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_DATABASE_UNAVAILABLE');
  const tokenHash = createHash('sha256').update(input.token, 'utf8').digest('hex');

  return prisma.$transaction(async (database: Prisma.TransactionClient) => {
    await database.$queryRaw`
      SELECT 1::INTEGER AS "locked"
      FROM (SELECT pg_advisory_xact_lock(13012026)) AS local_first_owner_setup_lock
    `;
    const [users, assignments, bootstrap] = await Promise.all([
      database.user.findMany({
        select: {
          id: true,
          emailNormalized: true,
          role: true,
          active: true,
          disabledAt: true,
          credentials: { where: { kind: 'PASSWORD' }, select: { id: true }, take: 1 },
        },
        take: 2,
      }),
      database.platformRoleAssignment.count(),
      database.platformOwnerBootstrap.findUnique({ where: { singletonKey: BOOTSTRAP_SINGLETON } }),
    ]);
    const pendingIdentity = users.length === 1 ? users[0] : null;
    const canCreate = users.length === 0;
    const canRenewActivation = Boolean(
      pendingIdentity &&
        pendingIdentity.emailNormalized === emailNormalized &&
        pendingIdentity.role === 'ADMIN' &&
        pendingIdentity.active &&
        !pendingIdentity.disabledAt &&
        pendingIdentity.credentials.length === 0,
    );
    if (assignments !== 0 || bootstrap || (!canCreate && !canRenewActivation)) {
      throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_ALREADY_INITIALIZED');
    }

    const user = canCreate
      ? await database.user.create({
          data: {
            email: emailNormalized,
            emailNormalized,
            name: 'Alexander',
            role: 'ADMIN',
            active: true,
          },
          select: { id: true },
        })
      : { id: pendingIdentity!.id };

    await database.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    await database.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: input.expiresAt },
    });
    return { userId: user.id, accountCreated: canCreate, expiresAt: input.expiresAt };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function completeLocalFirstOwnerSetup(input: {
  email: string;
  environment?: Record<string, string | undefined>;
  now?: Date;
}) {
  const environment = input.environment ?? process.env;
  validateLocalFirstOwnerEnvironment(environment, 'complete');
  const emailNormalized = normalizeIdentityEmail(input.email);
  if (emailNormalized !== TARGET_EMAIL) {
    throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_TARGET_DENIED');
  }
  const prisma = await getPrisma();
  if (!prisma) throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_DATABASE_UNAVAILABLE');

  const now = input.now ?? new Date();
  const userCount = await prisma.user.count();
  const user = await prisma.user.findFirst({
    where: { emailNormalized },
    select: {
      id: true,
      emailNormalized: true,
      role: true,
      active: true,
      disabledAt: true,
      credentials: { where: { kind: 'PASSWORD' }, select: { id: true }, take: 1 },
    },
  });
  if (
    userCount !== 1 ||
    !user ||
    user.role !== 'ADMIN' ||
    !user.active ||
    user.disabledAt ||
    user.credentials.length !== 1
  ) {
    throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_ACTIVATION_REQUIRED');
  }

  const [consumedActivation, activeMfa, loginEvents]: [
    number,
    number,
    Array<{ id: string; safeMetadata: Prisma.JsonValue | null }>,
  ] = await Promise.all([
    prisma.passwordResetToken.count({ where: { userId: user.id, usedAt: { not: null } } }),
    prisma.mfaMethod.count({ where: { userId: user.id, status: 'ACTIVE', disabledAt: null } }),
    prisma.securityEvent.findMany({
      where: {
        userId: user.id,
        action: 'identity.login.success',
        result: 'SUCCEEDED',
        createdAt: { gt: new Date(now.getTime() - RECENT_AUTH_WINDOW_MS), lte: now },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, safeMetadata: true },
    }),
  ]);
  if (!consumedActivation) {
    throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_ACTIVATION_REQUIRED');
  }
  if (!activeMfa) throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_MFA_REQUIRED');

  const mfaEvent = loginEvents.find((event) => {
    if (!isRecord(event.safeMetadata)) return false;
    return event.safeMetadata.method === 'TOTP' && typeof event.safeMetadata.sessionId === 'string';
  });
  const sessionEvidenceId =
    mfaEvent && isRecord(mfaEvent.safeMetadata) ? mfaEvent.safeMetadata.sessionId : null;
  if (!mfaEvent || typeof sessionEvidenceId !== 'string') {
    throw new LocalFirstOwnerSetupError('LOCAL_FIRST_OWNER_RECENT_TOTP_LOGIN_REQUIRED');
  }

  const authorizationToken = randomBytes(32).toString('base64url');
  return executePlatformOwnerBootstrap({
    environment: 'local',
    expectedEnvironment: 'local',
    targetUserId: user.id,
    targetEmail: user.emailNormalized,
    sessionEvidenceId,
    mfaEventEvidenceId: mfaEvent.id,
    authorizationId: `local-first-owner-${randomUUID()}`,
    authorizationExpiresAt: new Date(now.getTime() + 5 * 60_000),
    authorizationToken,
    expectedAuthorizationHash: hashBootstrapAuthorization(authorizationToken),
    confirmation: 'BOOTSTRAP FIRST PLATFORM OWNER',
    now,
  });
}