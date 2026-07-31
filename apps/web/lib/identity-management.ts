import { getPrisma } from '@avantime/database';
import type { Prisma, PrismaClient } from '@prisma/client';

import { evaluateMfaPolicy, requireAdminMfa } from './identity-policy';
import {
  createTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotp,
} from './mfa';
import { hashPassword, validatePasswordPolicy, verifyPasswordVersioned } from './password';
import { revokeAllUserSessions, type AppSession } from './session';
import { evaluateOrganizationPermission } from './organization-permissions';

const MFA_ENROLLMENT_TTL_MS = 10 * 60_000;

const securityMfaMethodSelect = {
  id: true,
  kind: true,
  status: true,
  label: true,
  confirmedAt: true,
  createdAt: true,
} satisfies Prisma.MfaMethodSelect;

const securitySessionSelect = {
  id: true,
  deviceLabel: true,
  createdAt: true,
  lastActivityAt: true,
  expiresAt: true,
} satisfies Prisma.UserSessionSelect;

const securityIdentityProviderSelect = {
  id: true,
  key: true,
  kind: true,
  oidcProfile: true,
  displayName: true,
  enabled: true,
} satisfies Prisma.IdentityProviderSelect;

const securityExternalIdentitySelect = {
  id: true,
  emailVerified: true,
  createdAt: true,
  provider: {
    select: {
      key: true,
      displayName: true,
      kind: true,
    },
  },
} satisfies Prisma.ExternalIdentitySelect;

type SecurityMfaMethod = Prisma.MfaMethodGetPayload<{
  select: typeof securityMfaMethodSelect;
}>;
type SecuritySession = Prisma.UserSessionGetPayload<{
  select: typeof securitySessionSelect;
}>;
type SecurityIdentityProvider = Prisma.IdentityProviderGetPayload<{
  select: typeof securityIdentityProviderSelect;
}>;
type SecurityExternalIdentity = Prisma.ExternalIdentityGetPayload<{
  select: typeof securityExternalIdentitySelect;
}>;

export class IdentityOperationError extends Error {
  constructor(
    readonly code:
      | 'DATABASE_UNAVAILABLE'
      | 'MFA_ALREADY_ENABLED'
      | 'MFA_ENROLLMENT_NOT_FOUND'
      | 'MFA_NOT_ENABLED'
      | 'MFA_REQUIRED_BY_POLICY'
      | 'INVALID_MFA_CODE'
      | 'INVALID_PASSWORD'
      | 'SESSION_NOT_FOUND',
    message: string,
  ) {
    super(message);
  }
}

function requireDatabase(prisma: PrismaClient | null) {
  if (!prisma) {
    throw new IdentityOperationError('DATABASE_UNAVAILABLE', 'Identity database is unavailable.');
  }
  return prisma;
}

function recoveryRows(userId: string, codes: string[], batchId: string) {
  return codes.map((code) => ({
    userId,
    batchId,
    codeHash: hashRecoveryCode(code),
  }));
}

export async function getSecurityOverview(session: AppSession) {
  const prisma = requireDatabase((await getPrisma()) as PrismaClient | null);
  const now = new Date();
  const methodsQuery: Prisma.PrismaPromise<SecurityMfaMethod[]> = prisma.mfaMethod.findMany({
    where: { userId: session.userId, status: { in: ['PENDING', 'ACTIVE'] } },
    select: securityMfaMethodSelect,
    orderBy: { createdAt: 'desc' },
  });
  const sessionsQuery: Prisma.PrismaPromise<SecuritySession[]> = prisma.userSession.findMany({
    where: {
      userId: session.userId,
      revokedAt: null,
      expiresAt: { gt: now },
      idleExpiresAt: { gt: now },
    },
    select: securitySessionSelect,
    orderBy: { lastActivityAt: 'desc' },
    take: 50,
  });
  const providersQuery: Prisma.PrismaPromise<SecurityIdentityProvider[]> =
    prisma.identityProvider.findMany({
      where: {
        kind: { in: ['OIDC', 'SAML'] },
        OR: [{ companyId: null }, ...(session.companyId ? [{ companyId: session.companyId }] : [])],
      },
      select: securityIdentityProviderSelect,
      orderBy: { displayName: 'asc' },
    });
  const externalIdentitiesQuery: Prisma.PrismaPromise<SecurityExternalIdentity[]> =
    prisma.externalIdentity.findMany({
      where: { userId: session.userId },
      select: securityExternalIdentitySelect,
      orderBy: { createdAt: 'asc' },
    });
  const [methods, recoveryRemaining, sessions, policy, exemption, providers, externalIdentities] =
    await Promise.all([
      methodsQuery,
      prisma.recoveryCode.count({
        where: { userId: session.userId, usedAt: null },
      }),
      sessionsQuery,
      session.companyId
        ? prisma.organizationIdentityPolicy.findUnique({
            where: { companyId: session.companyId },
          })
        : null,
      session.companyId
        ? prisma.organizationMfaExemption.findUnique({
            where: {
              companyId_userId: {
                companyId: session.companyId,
                userId: session.userId,
              },
            },
          })
        : null,
      providersQuery,
      externalIdentitiesQuery,
    ]);
  const hasActiveMfa = methods.some((method) => method.status === 'ACTIVE');
  const policyDecision = evaluateMfaPolicy({
    role: session.role,
    organizationRole: session.organizationRole,
    hasActiveMfa,
    policy,
    exemption: exemption && exemption.expiresAt > now ? exemption : null,
    now,
    requireAdminMfa: requireAdminMfa(),
  });
  return {
    mfa: {
      enabled: hasActiveMfa,
      methods: methods.map((method) => ({
        id: method.id,
        kind: method.kind,
        status: method.status,
        label: method.label,
        confirmedAt: method.confirmedAt?.toISOString() ?? null,
        createdAt: method.createdAt.toISOString(),
      })),
      recoveryCodesRemaining: recoveryRemaining,
    },
    policy: {
      requirement: policy?.mfaRequirement ?? 'OPTIONAL',
      enforcementAt: policy?.enforcementAt?.toISOString() ?? null,
      gracePeriodDays: policy?.gracePeriodDays ?? 0,
      required: policyDecision.policyRequired,
      enrollmentRequired: policyDecision.enrollmentRequired,
      canManage: evaluateOrganizationPermission(session, 'identity.policy.manage').allowed,
      canManageProviders: evaluateOrganizationPermission(session, 'identity.providers.manage')
        .allowed,
      canViewAudit: evaluateOrganizationPermission(session, 'identity.audit.view').allowed,
    },
    sessions: sessions.map((item) => ({
      id: item.id,
      current: item.id === session.sessionId,
      deviceLabel: item.deviceLabel ?? 'Unknown browser · Unknown device',
      createdAt: item.createdAt.toISOString(),
      lastActivityAt: item.lastActivityAt.toISOString(),
      expiresAt: item.expiresAt.toISOString(),
    })),
    identityProviders: providers.map((provider) => ({
      id: provider.id,
      key: provider.key,
      kind: provider.kind === 'SAML' ? ('SAML' as const) : ('OIDC' as const),
      profile: provider.oidcProfile,
      displayName: provider.displayName,
      enabled: provider.enabled,
    })),
    externalIdentities: externalIdentities.map((identity) => ({
      id: identity.id,
      providerKey: identity.provider.key,
      providerName: identity.provider.displayName,
      kind: identity.provider.kind === 'SAML' ? ('SAML' as const) : ('OIDC' as const),
      emailVerified: identity.emailVerified,
      linkedAt: identity.createdAt.toISOString(),
    })),
  };
}

export async function beginTotpEnrollment(session: AppSession, now = new Date()) {
  const prisma = requireDatabase((await getPrisma()) as PrismaClient | null);
  const active = await prisma.mfaMethod.findFirst({
    where: { userId: session.userId, kind: 'TOTP', status: 'ACTIVE' },
    select: { id: true },
  });
  if (active) {
    throw new IdentityOperationError('MFA_ALREADY_ENABLED', 'TOTP is already enabled.');
  }
  const secret = generateTotpSecret();
  const secretEncrypted = encryptTotpSecret(secret);
  const method = await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    await database.mfaMethod.updateMany({
      where: { userId: session.userId, kind: 'TOTP', status: 'PENDING' },
      data: { status: 'DISABLED', disabledAt: now, secretEncrypted: null },
    });
    return database.mfaMethod.create({
      data: {
        userId: session.userId,
        kind: 'TOTP',
        status: 'PENDING',
        label: 'Authenticator app',
        secretEncrypted,
        createdAt: now,
      },
      select: { id: true },
    });
  });
  return {
    methodId: method.id as string,
    secret,
    otpauthUri: createTotpUri({
      secret,
      accountLabel: session.email,
    }),
  };
}

export async function confirmTotpEnrollment(
  session: AppSession,
  methodId: string,
  code: string,
  now = new Date(),
) {
  const prisma = requireDatabase((await getPrisma()) as PrismaClient | null);
  const method = await prisma.mfaMethod.findFirst({
    where: {
      id: methodId,
      userId: session.userId,
      kind: 'TOTP',
      status: 'PENDING',
    },
  });
  if (
    !method?.secretEncrypted ||
    method.createdAt.getTime() + MFA_ENROLLMENT_TTL_MS <= now.getTime()
  ) {
    throw new IdentityOperationError('MFA_ENROLLMENT_NOT_FOUND', 'MFA enrollment was not found.');
  }
  const verification = verifyTotp(decryptTotpSecret(method.secretEncrypted), code, { now });
  if (!verification.valid) {
    throw new IdentityOperationError('INVALID_MFA_CODE', 'MFA code is invalid.');
  }
  const codes = generateRecoveryCodes();
  const batchId = crypto.randomUUID();
  await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    const activated = await database.mfaMethod.updateMany({
      where: { id: method.id, userId: session.userId, status: 'PENDING' },
      data: {
        status: 'ACTIVE',
        confirmedAt: now,
        lastUsedCounter: verification.counter,
      },
    });
    if (activated.count !== 1) throw new Error('MFA enrollment replayed.');
    await database.recoveryCode.deleteMany({ where: { userId: session.userId } });
    await database.recoveryCode.createMany({
      data: recoveryRows(session.userId, codes, batchId),
    });
  });
  return codes;
}

async function verifyActiveMfaCode(
  prisma: PrismaClient,
  session: AppSession,
  code: string,
  now = new Date(),
) {
  const method = await prisma.mfaMethod.findFirst({
    where: { userId: session.userId, kind: 'TOTP', status: 'ACTIVE' },
  });
  if (!method?.secretEncrypted) {
    throw new IdentityOperationError('MFA_NOT_ENABLED', 'MFA is not enabled.');
  }
  const verification = verifyTotp(decryptTotpSecret(method.secretEncrypted), code, {
    now,
    lastUsedCounter: method.lastUsedCounter,
  });
  if (!verification.valid) {
    throw new IdentityOperationError('INVALID_MFA_CODE', 'MFA code is invalid.');
  }
  const updated = await prisma.mfaMethod.updateMany({
    where: {
      id: method.id,
      status: 'ACTIVE',
      OR: [{ lastUsedCounter: null }, { lastUsedCounter: { lt: verification.counter } }],
    },
    data: { lastUsedCounter: verification.counter },
  });
  if (updated.count !== 1) {
    throw new IdentityOperationError('INVALID_MFA_CODE', 'MFA code was already used.');
  }
  return method.id as string;
}

export async function regenerateRecoveryCodes(session: AppSession, code: string) {
  const prisma = requireDatabase((await getPrisma()) as PrismaClient | null);
  await verifyActiveMfaCode(prisma, session, code);
  const codes = generateRecoveryCodes();
  const batchId = crypto.randomUUID();
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId: session.userId } }),
    prisma.recoveryCode.createMany({
      data: recoveryRows(session.userId, codes, batchId),
    }),
  ]);
  return codes;
}

export async function disableTotp(session: AppSession, code: string) {
  const prisma = requireDatabase((await getPrisma()) as PrismaClient | null);
  const overview = await getSecurityOverview(session);
  if (overview.policy.required) {
    throw new IdentityOperationError(
      'MFA_REQUIRED_BY_POLICY',
      'MFA is required by the effective policy.',
    );
  }
  const methodId = await verifyActiveMfaCode(prisma, session, code);
  await prisma.$transaction([
    prisma.mfaMethod.update({
      where: { id: methodId },
      data: {
        status: 'DISABLED',
        disabledAt: new Date(),
        secretEncrypted: null,
      },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId: session.userId } }),
    prisma.userSession.updateMany({
      where: { userId: session.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function changePassword(
  session: AppSession,
  currentPassword: string,
  newPassword: string,
) {
  const prisma = requireDatabase((await getPrisma()) as PrismaClient | null);
  const credential = await prisma.userCredential.findUnique({
    where: { userId_kind: { userId: session.userId, kind: 'PASSWORD' } },
    select: { passwordHash: true },
  });
  if (!credential || !verifyPasswordVersioned(currentPassword, credential.passwordHash).valid) {
    throw new IdentityOperationError('INVALID_PASSWORD', 'Current password is invalid.');
  }
  const policy = validatePasswordPolicy(newPassword, session.email);
  if (!policy.valid) return policy;
  await prisma.$transaction([
    prisma.userCredential.update({
      where: { userId_kind: { userId: session.userId, kind: 'PASSWORD' } },
      data: { passwordHash: hashPassword(newPassword), passwordChangedAt: new Date() },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: session.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.userSession.updateMany({
      where: { userId: session.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  return { valid: true as const };
}

export async function revokeOwnSession(session: AppSession, targetSessionId: string) {
  const prisma = requireDatabase((await getPrisma()) as PrismaClient | null);
  const result = await prisma.userSession.updateMany({
    where: {
      id: targetSessionId,
      userId: session.userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  if (result.count !== 1) {
    throw new IdentityOperationError('SESSION_NOT_FOUND', 'Session was not found.');
  }
  return targetSessionId === session.sessionId;
}

export async function revokeOtherSessions(session: AppSession) {
  return revokeAllUserSessions(session.userId, session.sessionId);
}

export async function updateOrganizationMfaPolicy(
  session: AppSession,
  input: {
    requirement: 'OPTIONAL' | 'ADMINS' | 'ALL_MEMBERS';
    enforcementAt: string | null;
    gracePeriodDays: number;
  },
) {
  if (
    !evaluateOrganizationPermission(session, 'identity.policy.manage').allowed ||
    !session.companyId
  ) {
    throw new Error('Organization policy requires a tenant-scoped administrator.');
  }
  if (
    !['OPTIONAL', 'ADMINS', 'ALL_MEMBERS'].includes(input.requirement) ||
    !Number.isSafeInteger(input.gracePeriodDays) ||
    input.gracePeriodDays < 0 ||
    input.gracePeriodDays > 365
  ) {
    throw new Error('Organization MFA policy is invalid.');
  }
  const enforcementAt = input.enforcementAt ? new Date(input.enforcementAt) : null;
  if (enforcementAt && Number.isNaN(enforcementAt.getTime())) {
    throw new Error('Organization MFA enforcement date is invalid.');
  }
  const prisma = requireDatabase((await getPrisma()) as PrismaClient | null);
  return prisma.organizationIdentityPolicy.upsert({
    where: { companyId: session.companyId },
    update: {
      mfaRequirement: input.requirement,
      gracePeriodDays: input.gracePeriodDays,
      enforcementAt,
      updatedBy: session.userId,
    },
    create: {
      companyId: session.companyId,
      mfaRequirement: input.requirement,
      gracePeriodDays: input.gracePeriodDays,
      enforcementAt,
      updatedBy: session.userId,
    },
  });
}
