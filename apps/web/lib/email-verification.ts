import { createHash, randomBytes } from 'node:crypto';
import { getPrisma } from '@avantime/database';
import type { Prisma, PrismaClient } from '@prisma/client';

import { normalizeIdentityEmail } from './identity-auth';
import { safeReturnTo } from './safe-return-to';

const EMAIL_VERIFICATION_TTL_MS = 30 * 60_000;

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function createEmailVerification(
  email: string,
  redirectTo?: string,
  now = new Date(),
) {
  const token = randomBytes(32).toString('base64url');
  let deliverTo: string | null = null;
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new Error('Email verification database is unavailable.');
  const credential = await prisma.userCredential.findUnique({
    where: { identifierNormalized: normalizeIdentityEmail(email) },
    select: {
      user: {
        select: {
          id: true,
          active: true,
          disabledAt: true,
          emailVerifiedAt: true,
        },
      },
    },
  });
  if (credential?.user.active && !credential.user.disabledAt && !credential.user.emailVerifiedAt) {
    await prisma.$transaction([
      prisma.emailVerificationToken.updateMany({
        where: { userId: credential.user.id, usedAt: null },
        data: { usedAt: now },
      }),
      prisma.emailVerificationToken.create({
        data: {
          tokenHash: digest(token),
          userId: credential.user.id,
          redirectTo: safeReturnTo(redirectTo) ?? null,
          expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS),
        },
      }),
    ]);
    deliverTo = normalizeIdentityEmail(email);
  }
  return { token, deliverTo };
}

export type EmailVerificationResult =
  | { status: 'VERIFIED'; userId: string; companyId: string | null; redirectTo?: string }
  | { status: 'INVALID' };

export async function verifyEmailToken(
  token: string,
  now = new Date(),
): Promise<EmailVerificationResult> {
  if (!process.env.DATABASE_URL || !token || token.length > 256) return { status: 'INVALID' };
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new Error('Email verification database is unavailable.');
  const item = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: digest(token) },
    include: {
      user: {
        select: {
          id: true,
          active: true,
          disabledAt: true,
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
  if (!item || item.usedAt || item.expiresAt <= now || !item.user.active || item.user.disabledAt) {
    return { status: 'INVALID' };
  }
  const verified = await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    const consumed = await database.emailVerificationToken.updateMany({
      where: { id: item.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return false;
    await database.user.update({
      where: { id: item.userId },
      data: { emailVerifiedAt: now },
    });
    await database.emailVerificationToken.updateMany({
      where: { userId: item.userId, usedAt: null },
      data: { usedAt: now },
    });
    return true;
  });
  return verified
    ? {
        status: 'VERIFIED',
        userId: item.user.id,
        companyId: item.user.memberships[0]?.companyId ?? item.user.companyId,
        redirectTo: safeReturnTo(item.redirectTo ?? undefined),
      }
    : { status: 'INVALID' };
}

export const EMAIL_VERIFICATION_TTL_SECONDS = EMAIL_VERIFICATION_TTL_MS / 1000;
