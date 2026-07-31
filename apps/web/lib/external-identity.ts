import { getPrisma } from '@avantime/database';

import type { ValidatedOidcIdentity } from './oidc';
import { normalizeIdentityEmail } from './identity-auth';
import { recordIdentitySecurityEvent } from './identity-security-events';
import type { AppSession } from './session';

const SAFE_PROVIDER_KEY = /^[a-z0-9][a-z0-9._-]{1,99}$/u;
const REAUTHENTICATION_MAX_AGE_MS = 10 * 60_000;

type ReauthenticationEvidence = {
  userId: string;
  authenticatedAt: Date;
  method: 'PASSWORD' | 'TOTP' | 'RECOVERY_CODE';
};

function requireRecentReauthentication(
  session: AppSession,
  evidence: ReauthenticationEvidence,
  now = new Date(),
) {
  if (
    evidence.userId !== session.userId ||
    evidence.authenticatedAt.getTime() > now.getTime() ||
    now.getTime() - evidence.authenticatedAt.getTime() > REAUTHENTICATION_MAX_AGE_MS
  ) {
    throw new Error('Recent reauthentication is required.');
  }
}

function domainAllowed(email: string, allowedDomains: unknown) {
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) return true;
  const domain = normalizeIdentityEmail(email).split('@')[1];
  return allowedDomains.some(
    (candidate) =>
      typeof candidate === 'string' && candidate.toLowerCase() === domain?.toLowerCase(),
  );
}

export async function linkExternalIdentity(input: {
  session: AppSession;
  providerKey: string;
  assertion: ValidatedOidcIdentity;
  reauthentication: ReauthenticationEvidence;
  correlationId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  requireRecentReauthentication(input.session, input.reauthentication, now);
  if (
    !SAFE_PROVIDER_KEY.test(input.providerKey) ||
    !input.assertion.subject ||
    input.assertion.subject.length > 500
  ) {
    throw new Error('External identity input is invalid.');
  }
  const prisma = await getPrisma();
  if (!prisma) throw new Error('Identity database is unavailable.');
  const provider = await prisma.identityProvider.findUnique({
    where: { key: input.providerKey },
  });
  if (
    !provider?.enabled ||
    provider.kind !== 'OIDC' ||
    provider.validationStatus !== 'TENANT_VALIDATED' ||
    provider.issuer !== input.assertion.issuer ||
    (provider.companyId && provider.companyId !== input.session.companyId) ||
    !domainAllowed(input.assertion.email, provider.allowedDomains)
  ) {
    throw new Error('External identity provider is unavailable.');
  }
  const user = await prisma.user.findUnique({
    where: { id: input.session.userId },
    select: { id: true, active: true, disabledAt: true },
  });
  if (!user?.active || user.disabledAt) throw new Error('Identity is unavailable.');
  const linked = await prisma.externalIdentity.create({
    data: {
      userId: user.id,
      providerId: provider.id,
      subject: input.assertion.subject,
      emailNormalized: normalizeIdentityEmail(input.assertion.email),
      emailVerified: input.assertion.emailVerified,
      lastAuthenticatedAt: now,
    },
    select: { id: true, providerId: true, createdAt: true },
  });
  await recordIdentitySecurityEvent({
    context: {
      userId: input.session.userId,
      companyId: input.session.companyId ?? null,
      correlationId: input.correlationId,
    },
    action: 'identity.external.linked',
    result: 'SUCCEEDED',
    notify: true,
  });
  return linked;
}

export async function unlinkExternalIdentity(input: {
  session: AppSession;
  externalIdentityId: string;
  reauthentication: ReauthenticationEvidence;
  correlationId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  requireRecentReauthentication(input.session, input.reauthentication, now);
  const prisma = await getPrisma();
  if (!prisma) throw new Error('Identity database is unavailable.');
  const [credentials, externalIdentities] = await Promise.all([
    prisma.userCredential.count({ where: { userId: input.session.userId } }),
    prisma.externalIdentity.count({ where: { userId: input.session.userId } }),
  ]);
  if (credentials + externalIdentities <= 1) {
    throw new Error('The last login method cannot be removed.');
  }
  const removed = await prisma.externalIdentity.deleteMany({
    where: { id: input.externalIdentityId, userId: input.session.userId },
  });
  if (removed.count !== 1) throw new Error('External identity was not found.');
  await recordIdentitySecurityEvent({
    context: {
      userId: input.session.userId,
      companyId: input.session.companyId ?? null,
      correlationId: input.correlationId,
    },
    action: 'identity.external.unlinked',
    result: 'SUCCEEDED',
    notify: true,
  });
}

export function denyEmailOnlyIdentityLinking() {
  throw new Error('External identities cannot be linked by email match alone.');
}
