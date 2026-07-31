import { createHash, randomBytes } from 'node:crypto';
import { getPrisma } from '@avantime/database';
import type { Prisma, PrismaClient } from '@prisma/client';

import { getDemoIdentity } from './demo-auth';
import {
  evaluateMfaPolicy,
  isOrganizationLoginMethodAllowed,
  requireAdminMfa,
} from './identity-policy';
import { decryptTotpSecret, hashRecoveryCode, verifyTotp } from './mfa';
import { hashPassword, verifyPasswordAgainstDummy, verifyPasswordVersioned } from './password';
import { safeReturnTo } from './safe-return-to';
import type { SessionIdentity } from './session';

const LOGIN_CHALLENGE_TTL_MS = 5 * 60_000;
const LOGIN_CHALLENGE_MAX_ATTEMPTS = 5;

class MfaReplayError extends Error {}

export type PrimaryAuthenticationResult =
  | { status: 'AUTHENTICATED'; identity: SessionIdentity }
  | {
      status: 'MFA_REQUIRED';
      challengeToken: string;
      enrollmentRequired: boolean;
      userId: string;
      companyId: string | null;
    }
  | { status: 'INVALID' }
  | { status: 'UNAVAILABLE' };

export type MfaAuthenticationResult =
  | {
      status: 'AUTHENTICATED';
      identity: SessionIdentity;
      recoveryCodeUsed: boolean;
      returnTo?: string;
    }
  | { status: 'INVALID'; userId?: string; companyId?: string | null }
  | { status: 'EXPIRED'; userId?: string; companyId?: string | null }
  | { status: 'UNAVAILABLE' };

type UserRow = {
  id: string;
  email: string;
  emailNormalized: string;
  name: string;
  role: 'CLIENT' | 'ADMIN';
  active: boolean;
  disabledAt: Date | null;
  companyId: string | null;
  passwordHash: string | null;
  company: { name: string } | null;
  credentials: Array<{ id: string; passwordHash: string }>;
  memberships: Array<{
    companyId: string;
    active: boolean;
    company: { name: string };
  }>;
  mfaMethods: Array<{
    id: string;
    secretEncrypted: string | null;
    lastUsedCounter: number | null;
  }>;
};

export function normalizeIdentityEmail(value: string) {
  return value.trim().normalize('NFKC').toLowerCase();
}

export async function findIdentitySecurityContextByIdentifier(email: string) {
  try {
    const prisma = (await getPrisma()) as PrismaClient | null;
    if (!prisma) return { userId: null, companyId: null };
    const credential = await prisma.userCredential.findUnique({
      where: { identifierNormalized: normalizeIdentityEmail(email) },
      select: {
        user: {
          select: {
            id: true,
            companyId: true,
            memberships: {
              where: { active: true },
              select: { companyId: true },
              take: 1,
            },
          },
        },
      },
    });
    return {
      userId: credential?.user.id ?? null,
      companyId: credential?.user.memberships[0]?.companyId ?? credential?.user.companyId ?? null,
    };
  } catch {
    return { userId: null, companyId: null };
  }
}

export async function findLoginChallengeSecurityContext(rawToken: string) {
  try {
    const prisma = (await getPrisma()) as PrismaClient | null;
    if (!prisma) return { userId: null, companyId: null };
    const challenge = await prisma.loginChallenge.findUnique({
      where: { tokenHash: tokenHash(rawToken) },
      select: { userId: true, companyId: true },
    });
    return {
      userId: challenge?.userId ?? null,
      companyId: challenge?.companyId ?? null,
    };
  } catch {
    return { userId: null, companyId: null };
  }
}

function tokenHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function chooseMembership(user: UserRow) {
  const active = user.memberships.filter((membership) => membership.active);
  const preferred = active.find((membership) => membership.companyId === user.companyId);
  return preferred ?? (active.length === 1 ? active[0] : undefined);
}

function toIdentity(user: UserRow, mfaSatisfied: boolean): SessionIdentity | null {
  const membership = chooseMembership(user);
  if (!user.active || user.disabledAt || (user.role === 'CLIENT' && !membership)) return null;
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: membership?.companyId,
    company: membership?.company.name ?? user.company?.name ?? 'Avantime',
    mfaSatisfied,
    authenticationAt: Date.now(),
  };
}

async function loadMfaPolicy(prisma: PrismaClient, user: UserRow, now: Date) {
  const membership = chooseMembership(user);
  if (!membership) return { policy: null, exemption: null };
  const policy = await prisma.organizationIdentityPolicy.findUnique({
    where: { companyId: membership.companyId },
  });
  const exemption = policy
    ? await prisma.organizationMfaExemption.findUnique({
        where: {
          companyId_userId: { companyId: membership.companyId, userId: user.id },
        },
      })
    : null;
  return {
    policy,
    exemption: exemption && exemption.expiresAt > now ? exemption : null,
  };
}

async function createLoginChallenge(
  prisma: PrismaClient,
  user: UserRow,
  redirectTo: string | undefined,
  now: Date,
  identityProviderId?: string,
) {
  const rawToken = randomBytes(32).toString('base64url');
  const membership = chooseMembership(user);
  await prisma.loginChallenge.create({
    data: {
      tokenHash: tokenHash(rawToken),
      userId: user.id,
      companyId: membership?.companyId ?? null,
      identityProviderId: identityProviderId ?? null,
      redirectTo: safeReturnTo(redirectTo) ?? null,
      expiresAt: new Date(now.getTime() + LOGIN_CHALLENGE_TTL_MS),
    },
  });
  return rawToken;
}

async function loadAuthenticationUser(prisma: PrismaClient, userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      company: { select: { name: true } },
      credentials: { where: { kind: 'PASSWORD' }, take: 1 },
      memberships: {
        where: { active: true },
        include: { company: { select: { name: true } } },
      },
      mfaMethods: {
        where: { kind: 'TOTP', status: 'ACTIVE' },
        select: { id: true, secretEncrypted: true, lastUsedCounter: true },
      },
    },
  });
}

export async function authenticateExternalIdentity(input: {
  providerId: string;
  subject: string;
  redirectTo?: string;
  now?: Date;
}): Promise<PrimaryAuthenticationResult> {
  const now = input.now ?? new Date();
  try {
    const prisma = (await getPrisma()) as PrismaClient | null;
    if (!prisma) return { status: 'UNAVAILABLE' };
    const external = await prisma.externalIdentity.findUnique({
      where: {
        providerId_subject: {
          providerId: input.providerId,
          subject: input.subject,
        },
      },
      select: {
        userId: true,
        provider: {
          select: {
            id: true,
            companyId: true,
            enabled: true,
            validationStatus: true,
          },
        },
      },
    });
    if (
      !external?.provider.enabled ||
      external.provider.validationStatus !== 'TENANT_VALIDATED' ||
      !external.provider.companyId
    ) {
      return { status: 'INVALID' };
    }
    const user = (await loadAuthenticationUser(prisma, external.userId)) as UserRow | null;
    if (!user) return { status: 'INVALID' };
    const identity = toIdentity(user, false);
    if (!identity || identity.companyId !== external.provider.companyId) {
      return { status: 'INVALID' };
    }
    const { policy, exemption } = await loadMfaPolicy(prisma, user, now);
    if (
      !isOrganizationLoginMethodAllowed({
        policy,
        method: 'OIDC',
        providerId: external.provider.id,
        now,
      })
    ) {
      return { status: 'INVALID' };
    }
    const decision = evaluateMfaPolicy({
      role: user.role,
      hasActiveMfa: user.mfaMethods.length > 0,
      policy,
      exemption,
      now,
      requireAdminMfa: requireAdminMfa(),
    });
    if (decision.challengeRequired || decision.enrollmentRequired) {
      return {
        status: 'MFA_REQUIRED',
        challengeToken: await createLoginChallenge(
          prisma,
          user,
          input.redirectTo,
          now,
          external.provider.id,
        ),
        enrollmentRequired: decision.enrollmentRequired,
        userId: user.id,
        companyId: identity.companyId ?? null,
      };
    }
    return {
      status: 'AUTHENTICATED',
      identity: {
        ...identity,
        mfaSatisfied: true,
        identityProviderId: external.provider.id,
      },
    };
  } catch {
    return { status: 'UNAVAILABLE' };
  }
}

export async function authenticatePrimaryCredential(input: {
  email: string;
  password: string;
  redirectTo?: string;
  now?: Date;
  environment?: Record<string, string | undefined>;
}): Promise<PrimaryAuthenticationResult> {
  const environment = input.environment ?? process.env;
  const emailNormalized = normalizeIdentityEmail(input.email);
  const now = input.now ?? new Date();
  if (!environment.DATABASE_URL) {
    const demo = getDemoIdentity(emailNormalized, input.password, environment);
    if (demo) return { status: 'AUTHENTICATED', identity: demo };
    verifyPasswordAgainstDummy(input.password);
    return { status: 'INVALID' };
  }

  try {
    const prisma = (await getPrisma()) as PrismaClient | null;
    if (!prisma) return { status: 'UNAVAILABLE' };
    const credential = await prisma.userCredential.findUnique({
      where: { identifierNormalized: emailNormalized },
      include: {
        user: {
          include: {
            company: { select: { name: true } },
            credentials: { where: { kind: 'PASSWORD' }, take: 1 },
            memberships: {
              where: { active: true },
              include: { company: { select: { name: true } } },
            },
            mfaMethods: {
              where: { kind: 'TOTP', status: 'ACTIVE' },
              select: { id: true, secretEncrypted: true, lastUsedCounter: true },
            },
          },
        },
      },
    });
    const user = (credential?.user ?? null) as UserRow | null;

    if (!credential || !user) {
      verifyPasswordAgainstDummy(input.password);
      return { status: 'INVALID' };
    }

    const storedHash = credential.passwordHash;
    if (!storedHash) {
      verifyPasswordAgainstDummy(input.password);
      return { status: 'INVALID' };
    }
    const verification = verifyPasswordVersioned(input.password, storedHash);
    if (!verification.valid || !user.active || user.disabledAt) return { status: 'INVALID' };
    const identity = toIdentity(user, false);
    if (!identity) return { status: 'INVALID' };

    if (verification.needsRehash || user.passwordHash) {
      const replacement = hashPassword(input.password);
      await prisma.$transaction([
        prisma.userCredential.upsert({
          where: { userId_kind: { userId: user.id, kind: 'PASSWORD' } },
          update: { passwordHash: replacement, passwordChangedAt: now },
          create: {
            userId: user.id,
            kind: 'PASSWORD',
            identifierNormalized: emailNormalized,
            passwordHash: replacement,
            passwordChangedAt: now,
          },
        }),
        prisma.user.update({ where: { id: user.id }, data: { passwordHash: null } }),
      ]);
    }

    const { policy, exemption } = await loadMfaPolicy(prisma, user, now);
    if (!isOrganizationLoginMethodAllowed({ policy, method: 'LOCAL', now })) {
      return { status: 'INVALID' };
    }
    const decision = evaluateMfaPolicy({
      role: user.role,
      hasActiveMfa: user.mfaMethods.length > 0,
      policy,
      exemption,
      now,
      requireAdminMfa: requireAdminMfa(environment),
    });
    if (decision.challengeRequired || decision.enrollmentRequired) {
      return {
        status: 'MFA_REQUIRED',
        challengeToken: await createLoginChallenge(prisma, user, input.redirectTo, now),
        enrollmentRequired: decision.enrollmentRequired,
        userId: user.id,
        companyId: identity.companyId ?? null,
      };
    }
    return { status: 'AUTHENTICATED', identity: { ...identity, mfaSatisfied: true } };
  } catch {
    return { status: 'UNAVAILABLE' };
  }
}

async function loadChallenge(prisma: PrismaClient, rawToken: string) {
  return prisma.loginChallenge.findUnique({
    where: { tokenHash: tokenHash(rawToken) },
    include: {
      identityProvider: {
        select: {
          id: true,
          enabled: true,
          validationStatus: true,
        },
      },
      user: {
        include: {
          company: { select: { name: true } },
          credentials: { where: { kind: 'PASSWORD' }, take: 1 },
          memberships: {
            where: { active: true },
            include: { company: { select: { name: true } } },
          },
          mfaMethods: {
            where: { kind: 'TOTP', status: 'ACTIVE' },
            select: { id: true, secretEncrypted: true, lastUsedCounter: true },
          },
        },
      },
    },
  });
}

export async function authenticateMfaChallenge(input: {
  challengeToken: string;
  code: string;
  now?: Date;
  environment?: Record<string, string | undefined>;
}): Promise<MfaAuthenticationResult> {
  const now = input.now ?? new Date();
  try {
    const prisma = (await getPrisma()) as PrismaClient | null;
    if (!prisma) return { status: 'UNAVAILABLE' };
    const challenge = await loadChallenge(prisma, input.challengeToken);
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= LOGIN_CHALLENGE_MAX_ATTEMPTS ||
      (challenge.identityProviderId &&
        (!challenge.identityProvider?.enabled ||
          challenge.identityProvider.validationStatus !== 'TENANT_VALIDATED')) ||
      !challenge.user.active ||
      challenge.user.disabledAt
    ) {
      return {
        status: 'EXPIRED',
        userId: challenge?.user?.id,
        companyId: challenge?.companyId ?? null,
      };
    }
    const user = challenge.user as UserRow;
    const method = user.mfaMethods[0];
    let recoveryCodeUsed = false;
    let verification:
      | { kind: 'totp'; counter: number; methodId: string }
      | { kind: 'recovery'; recoveryCodeId: string }
      | null = null;

    if (method?.secretEncrypted && /^\d{6}$/u.test(input.code)) {
      const secret = decryptTotpSecret(method.secretEncrypted, input.environment ?? process.env);
      const result = verifyTotp(secret, input.code, {
        now,
        lastUsedCounter: method.lastUsedCounter,
      });
      if (result.valid) {
        verification = { kind: 'totp', counter: result.counter, methodId: method.id };
      }
    } else {
      const recovery = await prisma.recoveryCode.findUnique({
        where: { codeHash: hashRecoveryCode(input.code) },
        select: { id: true, userId: true, usedAt: true },
      });
      if (recovery?.userId === user.id && !recovery.usedAt) {
        verification = { kind: 'recovery', recoveryCodeId: recovery.id };
        recoveryCodeUsed = true;
      }
    }

    if (!verification) {
      await prisma.loginChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          attempts: { lt: LOGIN_CHALLENGE_MAX_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });
      return {
        status: 'INVALID',
        userId: user.id,
        companyId: challenge.companyId ?? null,
      };
    }

    try {
      await prisma.$transaction(async (database: Prisma.TransactionClient) => {
        const challengeUpdate = await database.loginChallenge.updateMany({
          where: {
            id: challenge.id,
            consumedAt: null,
            expiresAt: { gt: now },
            attempts: { lt: LOGIN_CHALLENGE_MAX_ATTEMPTS },
          },
          data: { consumedAt: now },
        });
        if (challengeUpdate.count !== 1) throw new MfaReplayError();
        if (verification.kind === 'totp') {
          const methodUpdate = await database.mfaMethod.updateMany({
            where: {
              id: verification.methodId,
              status: 'ACTIVE',
              OR: [{ lastUsedCounter: null }, { lastUsedCounter: { lt: verification.counter } }],
            },
            data: { lastUsedCounter: verification.counter },
          });
          if (methodUpdate.count !== 1) throw new MfaReplayError();
          return;
        }
        const recoveryUpdate = await database.recoveryCode.updateMany({
          where: { id: verification.recoveryCodeId, userId: user.id, usedAt: null },
          data: { usedAt: now },
        });
        if (recoveryUpdate.count !== 1) throw new MfaReplayError();
      });
    } catch (error) {
      if (error instanceof MfaReplayError) {
        return {
          status: 'EXPIRED',
          userId: user.id,
          companyId: challenge.companyId ?? null,
        };
      }
      throw error;
    }
    const identity = toIdentity(user, true);
    return identity
      ? {
          status: 'AUTHENTICATED',
          identity: {
            ...identity,
            identityProviderId: challenge.identityProviderId ?? undefined,
          },
          recoveryCodeUsed,
          returnTo: safeReturnTo(challenge.redirectTo ?? undefined),
        }
      : { status: 'INVALID' };
  } catch {
    return { status: 'UNAVAILABLE' };
  }
}

export function isSameOriginMutation(
  request: Request,
  environment: Record<string, string | undefined> = process.env,
) {
  const origin = request.headers.get('origin');
  if (!origin) return environment.NODE_ENV !== 'production';
  try {
    const requestUrl = new URL(request.url);
    const expectedOrigin = environment.AUTH_PUBLIC_ORIGIN?.trim() || requestUrl.origin;
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}
