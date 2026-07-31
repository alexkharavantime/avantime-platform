import { createHash, randomBytes } from 'node:crypto';
import { getPrisma } from '@avantime/database';
import type { Prisma, PrismaClient } from '@prisma/client';

import { hashPassword, validatePasswordPolicy } from './password';

const PASSWORD_RESET_TTL_MS = 30 * 60_000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export async function createPasswordReset(email: string) {
  const emailNormalized = email.trim().normalize('NFKC').toLowerCase();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = digest(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  let deliverTo: string | null = null;
  if (process.env.DATABASE_URL) {
    const prisma = (await getPrisma()) as PrismaClient | null;
    if (!prisma) throw new Error('Password reset database is unavailable.');
    const credential = await prisma.userCredential.findUnique({
      where: { identifierNormalized: emailNormalized },
      select: {
        user: { select: { id: true, active: true, disabledAt: true } },
      },
    });
    const user = credential?.user;
    if (user?.active && !user.disabledAt) {
      await prisma.$transaction([
        prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        prisma.passwordResetToken.create({
          data: { tokenHash, userId: user.id, expiresAt },
        }),
      ]);
      deliverTo = emailNormalized;
    }
  }
  return { token, deliverTo };
}

export type PasswordResetResult =
  | { status: 'SUCCEEDED'; userId: string; companyId: string | null }
  | { status: 'INVALID' }
  | {
      status: 'POLICY_REJECTED';
      code: 'PASSWORD_POLICY_REJECTED';
      error: string;
    };

export async function resetPassword(token: string, password: string): Promise<PasswordResetResult> {
  if (!process.env.DATABASE_URL || token.length > 256) return { status: 'INVALID' };
  const tokenHash = digest(token);
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new Error('Password reset database is unavailable.');
  const item = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
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
  const now = new Date();
  if (!item || item.usedAt || item.expiresAt <= now || !item.user.active || item.user.disabledAt) {
    return { status: 'INVALID' };
  }
  const policy = validatePasswordPolicy(password, item.user.email);
  if (!policy.valid) {
    return { status: 'POLICY_REJECTED', code: policy.code, error: policy.error };
  }

  const replacement = hashPassword(password);
  const changed = await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    const consumed = await database.passwordResetToken.updateMany({
      where: { id: item.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return false;
    await database.userCredential.upsert({
      where: { userId_kind: { userId: item.userId, kind: 'PASSWORD' } },
      update: { passwordHash: replacement, passwordChangedAt: now },
      create: {
        userId: item.userId,
        kind: 'PASSWORD',
        identifierNormalized: item.user.email.trim().normalize('NFKC').toLowerCase(),
        passwordHash: replacement,
        passwordChangedAt: now,
      },
    });
    await database.user.update({
      where: { id: item.userId },
      data: { passwordHash: null },
    });
    await database.passwordResetToken.updateMany({
      where: { userId: item.userId, usedAt: null },
      data: { usedAt: now },
    });
    await database.userSession.updateMany({
      where: { userId: item.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return true;
  });
  if (!changed) return { status: 'INVALID' };
  return {
    status: 'SUCCEEDED',
    userId: item.user.id,
    companyId: item.user.memberships[0]?.companyId ?? item.user.companyId,
  };
}
