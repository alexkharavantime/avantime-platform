import { createHash, randomBytes } from 'node:crypto';
import { getPrisma } from '@avantime/database';
import type { Prisma } from '@prisma/client';

import { normalizeIdentityEmail } from './identity-auth';
import { identityPublicUrl } from './identity-public-url';
import { defaultLocale, isLocale, localePath } from './i18n';
import { inviteMemberToCompanyAsPlatformAdminInTransaction } from './team';
import type { OrganizationRole } from './session';

const VERIFICATION_TTL_MS = 30 * 60_000;

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export class AccessRequestError extends Error {
  constructor(
    readonly code:
      | 'INVALID_TOKEN'
      | 'NOT_FOUND'
      | 'INVALID_STATE'
      | 'DATABASE_UNAVAILABLE',
  ) {
    super('Access request operation failed.');
  }
}

export type AccessRequestStatus = 'PENDING' | 'EMAIL_VERIFIED' | 'APPROVED' | 'REJECTED';

export type AccessRequestSummary = {
  id: string;
  name: string;
  email: string;
  companyName: string;
  comment: string | null;
  status: AccessRequestStatus;
  emailVerifiedAt: Date | null;
  decisionCompanyId: string | null;
  decisionRole: OrganizationRole | null;
  rejectionReason: string | null;
  createdAt: Date;
};

type AccessRequestRow = Prisma.AccessRequestGetPayload<Record<string, never>>;

function toSummary(row: AccessRequestRow): AccessRequestSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    companyName: row.companyName,
    comment: row.comment,
    status: row.status,
    emailVerifiedAt: row.emailVerifiedAt,
    decisionCompanyId: row.decisionCompanyId,
    decisionRole: row.decisionRole,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
  };
}

async function requirePrisma() {
  const prisma = await getPrisma();
  if (!prisma) throw new AccessRequestError('DATABASE_UNAVAILABLE');
  return prisma;
}

export async function createAccessRequest(
  input: { name: string; email: string; companyName: string; comment?: string; locale?: string },
  now = new Date(),
) {
  const prisma = await requirePrisma();
  const emailNormalized = normalizeIdentityEmail(input.email);
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MS);

  await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    // A visitor can only ever have one still-pending (unverified) request; verified/decided
    // requests are left untouched so a duplicate submission cannot hide them from review.
    await database.accessRequest.updateMany({
      where: { emailNormalized, status: 'PENDING' },
      data: { status: 'REJECTED', rejectionReason: 'Superseded by a newer request.' },
    });
    await database.accessRequest.create({
      data: {
        name: input.name.trim().slice(0, 200),
        email: emailNormalized,
        emailNormalized,
        companyName: input.companyName.trim().slice(0, 200),
        comment: input.comment?.trim().slice(0, 2000) || null,
        locale: input.locale,
        status: 'PENDING',
        verificationTokenHash: digest(token),
        verificationExpiresAt: expiresAt,
      },
    });
  });

  return { token, email: emailNormalized };
}

export async function verifyAccessRequestEmail(token: string, now = new Date()) {
  if (!token || token.length > 256) throw new AccessRequestError('INVALID_TOKEN');
  const prisma = await requirePrisma();
  const tokenHash = digest(token);
  const claimedId = await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    const candidate = await database.accessRequest.findUnique({ where: { verificationTokenHash: tokenHash } });
    if (
      !candidate ||
      candidate.status !== 'PENDING' ||
      !candidate.verificationExpiresAt ||
      candidate.verificationExpiresAt <= now
    ) {
      return null;
    }
    const claimed = await database.accessRequest.updateMany({
      where: { id: candidate.id, status: 'PENDING', verificationTokenHash: tokenHash },
      data: {
        status: 'EMAIL_VERIFIED',
        emailVerifiedAt: now,
        // The link is single-use: clearing the token hash prevents replay of the same link.
        verificationTokenHash: null,
        verificationExpiresAt: null,
      },
    });
    return claimed.count === 1 ? candidate.id : null;
  });
  if (!claimedId) throw new AccessRequestError('INVALID_TOKEN');
  return prisma.accessRequest.findUnique({
    where: { id: claimedId },
    select: { id: true, locale: true },
  });
}

export async function rotateAccessRequestVerification(requestId: string, now = new Date()) {
  const prisma = await requirePrisma();
  const request = await prisma.accessRequest.findUnique({
    where: { id: requestId },
    select: { id: true, email: true, locale: true, status: true, verificationTokenHash: true },
  });
  if (!request) throw new AccessRequestError('NOT_FOUND');
  if (request.status !== 'PENDING') throw new AccessRequestError('INVALID_STATE');

  const token = randomBytes(32).toString('base64url');
  const updated = await prisma.accessRequest.updateMany({
    where: {
      id: request.id,
      status: 'PENDING',
      verificationTokenHash: request.verificationTokenHash,
    },
    data: {
      verificationTokenHash: digest(token),
      verificationExpiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
    },
  });
  if (updated.count !== 1) throw new AccessRequestError('INVALID_STATE');

  return { id: request.id, email: request.email, locale: request.locale, token };
}

export function buildAccessRequestVerificationUrl(
  token: string,
  locale: string | null | undefined,
  requestUrl: string,
) {
  const resolvedLocale = isLocale(locale) ? locale : defaultLocale;
  const url = identityPublicUrl(
    localePath(resolvedLocale, '/portal/request-access/verify'),
    requestUrl,
  );
  url.searchParams.set('token', token);
  return url.toString();
}

export async function listAccessRequestsForReview(): Promise<AccessRequestSummary[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const rows = await prisma.accessRequest.findMany({
    where: { status: { in: ['PENDING', 'EMAIL_VERIFIED', 'APPROVED', 'REJECTED'] } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map(toSummary);
}

export type AccessRequestDecision =
  | { action: 'approve'; companyId: string; role: OrganizationRole }
  | { action: 'reject'; reason?: string };

export async function decideAccessRequest(
  actorUserId: string,
  requestId: string,
  decision: AccessRequestDecision,
  now = new Date(),
) {
  const prisma = await requirePrisma();
  const request = await prisma.accessRequest.findUnique({
    where: { id: requestId },
    select: { email: true, locale: true },
  });
  if (!request) throw new AccessRequestError('NOT_FOUND');

  if (decision.action === 'reject') {
    const updated = await prisma.accessRequest.updateMany({
      where: { id: requestId, status: 'EMAIL_VERIFIED' },
      data: {
        status: 'REJECTED',
        decidedById: actorUserId,
        decidedAt: now,
        rejectionReason: decision.reason?.trim().slice(0, 500) || null,
      },
    });
    if (updated.count !== 1) throw new AccessRequestError('INVALID_STATE');
    return { status: 'REJECTED' as const };
  }

  const invitation = await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    const claimed = await database.accessRequest.updateMany({
      where: { id: requestId, status: 'EMAIL_VERIFIED' },
      data: {
        status: 'APPROVED',
        decidedById: actorUserId,
        decidedAt: now,
        decisionCompanyId: decision.companyId,
        decisionRole: decision.role,
      },
    });
    if (claimed.count !== 1) throw new AccessRequestError('INVALID_STATE');

    const createdInvitation = await inviteMemberToCompanyAsPlatformAdminInTransaction(
      database,
      actorUserId,
      { companyId: decision.companyId, email: request.email, role: decision.role },
      now,
    );
    await database.accessRequest.update({
      where: { id: requestId },
      data: { invitationId: createdInvitation.id },
    });
    return createdInvitation;
  });
  return { status: 'APPROVED' as const, invitation, locale: request.locale ?? undefined };
}
