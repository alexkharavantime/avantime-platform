import { createHash, timingSafeEqual } from 'node:crypto';

import { getPrisma } from '@avantime/database';
import type { Prisma } from '@prisma/client';

const BOOTSTRAP_SINGLETON = 'first-platform-owner-v1';
const CONFIRMATION_PHRASE = 'BOOTSTRAP FIRST PLATFORM OWNER';
const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,199}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ALLOWED_ENVIRONMENTS = new Set(['integration', 'staging']);
const RECENT_AUTH_WINDOW_MS = 10 * 60_000;
const MAX_AUTHORIZATION_LIFETIME_MS = 15 * 60_000;

export class PlatformOwnerBootstrapError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type PlatformOwnerBootstrapInput = {
  environment: string;
  expectedEnvironment: string;
  targetUserId: string;
  targetEmail: string;
  sessionEvidenceId: string;
  mfaEventEvidenceId: string;
  authorizationId: string;
  authorizationExpiresAt: Date;
  authorizationToken: string;
  expectedAuthorizationHash: string;
  confirmation: string;
  now?: Date;
};

type BootstrapTransaction = Prisma.TransactionClient;

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hashBootstrapAuthorization(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hashesMatch(actual: string, expected: string) {
  if (!SHA256.test(actual) || !SHA256.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

export function validatePlatformOwnerBootstrapRequest(input: PlatformOwnerBootstrapInput) {
  const now = input.now ?? new Date();
  if (
    !ALLOWED_ENVIRONMENTS.has(input.environment) ||
    input.environment !== input.expectedEnvironment
  ) {
    throw new PlatformOwnerBootstrapError('BOOTSTRAP_ENVIRONMENT_DENIED');
  }
  if (input.confirmation !== CONFIRMATION_PHRASE) {
    throw new PlatformOwnerBootstrapError('BOOTSTRAP_CONFIRMATION_REQUIRED');
  }
  if (
    !SAFE_REFERENCE.test(input.targetUserId) ||
    !SAFE_REFERENCE.test(input.sessionEvidenceId) ||
    !SAFE_REFERENCE.test(input.mfaEventEvidenceId) ||
    !SAFE_REFERENCE.test(input.authorizationId)
  ) {
    throw new PlatformOwnerBootstrapError('BOOTSTRAP_REFERENCE_INVALID');
  }
  if (
    normalizedEmail(input.targetEmail).length < 3 ||
    !normalizedEmail(input.targetEmail).includes('@')
  ) {
    throw new PlatformOwnerBootstrapError('BOOTSTRAP_TARGET_INVALID');
  }
  if (
    input.authorizationToken.length < 32 ||
    input.authorizationExpiresAt <= now ||
    input.authorizationExpiresAt.getTime() - now.getTime() > MAX_AUTHORIZATION_LIFETIME_MS
  ) {
    throw new PlatformOwnerBootstrapError('BOOTSTRAP_AUTHORIZATION_INVALID');
  }
  const authorizationHash = hashBootstrapAuthorization(input.authorizationToken);
  if (!hashesMatch(authorizationHash, input.expectedAuthorizationHash)) {
    throw new PlatformOwnerBootstrapError('BOOTSTRAP_AUTHORIZATION_INVALID');
  }
  return { now, authorizationHash, targetEmailNormalized: normalizedEmail(input.targetEmail) };
}

function securityMetadata(value: Prisma.JsonValue | null) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  return value as Record<string, Prisma.JsonValue>;
}

async function validateDatabaseEvidence(
  database: BootstrapTransaction,
  input: PlatformOwnerBootstrapInput,
  validation: ReturnType<typeof validatePlatformOwnerBootstrapRequest>,
) {
  const [target, session, mfaEvent, activeMfa, activeOwners, existingBootstrap] = await Promise.all(
    [
      database.user.findUnique({
        where: { id: input.targetUserId },
        select: { id: true, emailNormalized: true, active: true, disabledAt: true },
      }),
      database.userSession.findUnique({ where: { id: input.sessionEvidenceId } }),
      database.securityEvent.findUnique({ where: { id: input.mfaEventEvidenceId } }),
      database.mfaMethod.count({
        where: { userId: input.targetUserId, status: 'ACTIVE', disabledAt: null },
      }),
      database.platformRoleAssignment.count({
        where: {
          role: 'PLATFORM_OWNER',
          active: true,
          disabledAt: null,
          user: { active: true, disabledAt: null },
        },
      }),
      database.platformOwnerBootstrap.findUnique({ where: { singletonKey: BOOTSTRAP_SINGLETON } }),
    ],
  );
  if (
    !target?.active ||
    target.disabledAt ||
    target.emailNormalized !== validation.targetEmailNormalized
  ) {
    throw new PlatformOwnerBootstrapError('BOOTSTRAP_TARGET_INVALID');
  }
  if (activeOwners !== 0 || existingBootstrap) {
    throw new PlatformOwnerBootstrapError('BOOTSTRAP_ALREADY_COMPLETED');
  }
  if (
    !session ||
    session.userId !== target.id ||
    session.revokedAt ||
    session.expiresAt <= validation.now ||
    session.idleExpiresAt <= validation.now ||
    session.authenticationAt > validation.now ||
    validation.now.getTime() - session.authenticationAt.getTime() > RECENT_AUTH_WINDOW_MS
  ) {
    throw new PlatformOwnerBootstrapError('BOOTSTRAP_RECENT_AUTH_REQUIRED');
  }
  const metadata = securityMetadata(mfaEvent?.safeMetadata ?? null);
  if (
    !mfaEvent ||
    mfaEvent.userId !== target.id ||
    mfaEvent.action !== 'identity.login.success' ||
    mfaEvent.result !== 'SUCCEEDED' ||
    metadata?.method !== 'TOTP' ||
    metadata.sessionId !== session.id ||
    mfaEvent.createdAt > validation.now ||
    validation.now.getTime() - mfaEvent.createdAt.getTime() > RECENT_AUTH_WINDOW_MS ||
    activeMfa < 1
  ) {
    throw new PlatformOwnerBootstrapError('BOOTSTRAP_MFA_EVIDENCE_REQUIRED');
  }
}

export async function dryRunPlatformOwnerBootstrap(input: PlatformOwnerBootstrapInput) {
  const validation = validatePlatformOwnerBootstrapRequest(input);
  const prisma = await getPrisma();
  if (!prisma) throw new PlatformOwnerBootstrapError('BOOTSTRAP_DATABASE_UNAVAILABLE');
  await prisma.$transaction(async (transaction: BootstrapTransaction) => {
    await validateDatabaseEvidence(transaction, input, validation);
  });
  return {
    mode: 'dry-run' as const,
    environment: input.environment,
    authorizationId: input.authorizationId,
    targetUserHash: hashBootstrapAuthorization(input.targetUserId),
    validatedAt: validation.now,
  };
}

export async function executePlatformOwnerBootstrap(input: PlatformOwnerBootstrapInput) {
  const validation = validatePlatformOwnerBootstrapRequest(input);
  const prisma = await getPrisma();
  if (!prisma) throw new PlatformOwnerBootstrapError('BOOTSTRAP_DATABASE_UNAVAILABLE');
  return prisma.$transaction(async (transaction: BootstrapTransaction) => {
    await transaction.$queryRaw`
      SELECT 1::INTEGER AS "locked"
      FROM (SELECT pg_advisory_xact_lock(13012026)) AS platform_owner_bootstrap_lock
    `;
    await validateDatabaseEvidence(transaction, input, validation);
    const assignment = await transaction.platformRoleAssignment.create({
      data: { userId: input.targetUserId, role: 'PLATFORM_OWNER', assignedById: null },
    });
    await transaction.userSession.updateMany({
      where: { userId: input.targetUserId, revokedAt: null },
      data: { revokedAt: validation.now },
    });
    const auditEventId = crypto.randomUUID();
    await transaction.productionAuditEvent.create({
      data: {
        id: auditEventId,
        companyId: null,
        actorId: input.targetUserId,
        action: 'platform.owner.bootstrap.executed',
        targetType: 'platform-role-assignment',
        targetId: assignment.id,
        result: 'SUCCEEDED',
        correlationId: input.authorizationId,
        safeMetadata: {
          environment: input.environment,
          authorizationId: input.authorizationId,
          sessionEvidenceHash: hashBootstrapAuthorization(input.sessionEvidenceId),
          mfaEventEvidenceId: input.mfaEventEvidenceId,
        },
      },
    });
    const notification = await transaction.governanceNotification.create({
      data: {
        recipientId: input.targetUserId,
        companyId: null,
        category: 'SECURITY',
        title: 'Первый PLATFORM_OWNER назначен',
        href: '/portal/platform/audit',
      },
    });
    const bootstrap = await transaction.platformOwnerBootstrap.create({
      data: {
        singletonKey: BOOTSTRAP_SINGLETON,
        authorizationId: input.authorizationId,
        authorizationHash: validation.authorizationHash,
        environment: input.environment,
        targetUserId: input.targetUserId,
        sessionEvidenceHash: hashBootstrapAuthorization(input.sessionEvidenceId),
        mfaEventEvidenceId: input.mfaEventEvidenceId,
        authorizationExpiresAt: input.authorizationExpiresAt,
        assignmentId: assignment.id,
        auditEventId,
        notificationId: notification.id,
        executedAt: validation.now,
      },
    });
    return {
      mode: 'execute' as const,
      environment: input.environment,
      authorizationId: input.authorizationId,
      targetUserHash: hashBootstrapAuthorization(input.targetUserId),
      assignmentId: assignment.id,
      bootstrapId: bootstrap.id,
      auditEventId,
      notificationId: notification.id,
      executedAt: validation.now,
    };
  });
}
