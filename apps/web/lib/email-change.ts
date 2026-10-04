import { createHash, randomBytes } from 'node:crypto';

import { getPrisma } from '@avantime/database';
import type { Prisma, PrismaClient } from '@prisma/client';

import { normalizeIdentityEmail } from './identity-auth';

const EMAIL_CHANGE_TTL_MS = 30 * 60_000;

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export class EmailChangeError extends Error {
  constructor(
    readonly code:
      | 'DATABASE_UNAVAILABLE'
      | 'USER_UNAVAILABLE'
      | 'INVALID_EMAIL'
      | 'EMAIL_ALREADY_IN_USE'
      | 'ALREADY_CURRENT'
      | 'INVALID_TOKEN',
  ) {
    super('Email change operation failed.');
  }
}

function requireDatabase(prisma: PrismaClient | null) {
  if (!prisma) throw new EmailChangeError('DATABASE_UNAVAILABLE');
  return prisma;
}

function validEmail(email: string) {
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
}

async function assertEmailAvailable(
  database: Prisma.TransactionClient,
  userId: string,
  emailNormalized: string,
) {
  const [user, credential] = await Promise.all([
    database.user.findFirst({
      where: { emailNormalized, id: { not: userId } },
      select: { id: true },
    }),
    database.userCredential.findUnique({
      where: { identifierNormalized: emailNormalized },
      select: { userId: true },
    }),
  ]);
  if (user || (credential && credential.userId !== userId)) {
    throw new EmailChangeError('EMAIL_ALREADY_IN_USE');
  }
}

export async function createEmailChangeVerification(
  userId: string,
  rawEmail: string,
  now = new Date(),
) {
  const emailNormalized = normalizeIdentityEmail(rawEmail);
  if (!validEmail(emailNormalized)) throw new EmailChangeError('INVALID_EMAIL');
  const prisma = requireDatabase((await getPrisma()) as PrismaClient | null);
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + EMAIL_CHANGE_TTL_MS);

  const verification = await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    const user = await database.user.findUnique({
      where: { id: userId },
      select: { id: true, emailNormalized: true, active: true, disabledAt: true },
    });
    if (!user?.active || user.disabledAt) throw new EmailChangeError('USER_UNAVAILABLE');
    if (user.emailNormalized === emailNormalized) throw new EmailChangeError('ALREADY_CURRENT');
    await assertEmailAvailable(database, userId, emailNormalized);
    await database.emailChangeVerification.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
    return database.emailChangeVerification.create({
      data: {
        userId,
        email: emailNormalized,
        emailNormalized,
        tokenHash: digest(token),
        expiresAt,
      },
      select: { id: true },
    });
  });

  return { id: verification.id, token, email: emailNormalized, expiresAt };
}

export async function confirmEmailChange(token: string, now = new Date()) {
  if (!token || token.length > 256) throw new EmailChangeError('INVALID_TOKEN');
  const prisma = requireDatabase((await getPrisma()) as PrismaClient | null);
  const tokenHash = digest(token);

  return prisma.$transaction(async (database: Prisma.TransactionClient) => {
    const verification = await database.emailChangeVerification.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        email: true,
        emailNormalized: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { active: true, disabledAt: true } },
      },
    });
    if (
      !verification ||
      verification.usedAt ||
      verification.expiresAt <= now ||
      !verification.user.active ||
      verification.user.disabledAt
    ) {
      throw new EmailChangeError('INVALID_TOKEN');
    }

    await database.$queryRaw`
      SELECT 1::INTEGER AS "locked"
      FROM (
        SELECT pg_advisory_xact_lock(hashtextextended(${verification.emailNormalized}, 0))
      ) AS email_change_lock
    `;
    await assertEmailAvailable(database, verification.userId, verification.emailNormalized);
    const claimed = await database.emailChangeVerification.updateMany({
      where: { id: verification.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new EmailChangeError('INVALID_TOKEN');

    await database.user.update({
      where: { id: verification.userId },
      data: {
        email: verification.email,
        emailNormalized: verification.emailNormalized,
        emailVerifiedAt: now,
      },
    });
    await database.userCredential.updateMany({
      where: { userId: verification.userId },
      data: { identifierNormalized: verification.emailNormalized },
    });
    await database.userSession.updateMany({
      where: { userId: verification.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await database.emailChangeVerification.updateMany({
      where: { userId: verification.userId, id: { not: verification.id }, usedAt: null },
      data: { usedAt: now },
    });
    return { userId: verification.userId };
  });
}