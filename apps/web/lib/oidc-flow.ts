import { getPrisma } from '@avantime/database';
import { Prisma, type PrismaClient } from '@prisma/client';

import { linkExternalIdentity } from './external-identity';
import { authenticateExternalIdentity, normalizeIdentityEmail } from './identity-auth';
import { recordIdentitySecurityEvent } from './identity-security-events';
import {
  consumeOidcAuthorization,
  hashOidcValue,
  OidcValidationError,
  validateOidcIdToken,
  type OidcProviderContract,
  type OidcTokenClaimMapping,
  type ValidatedOidcIdentity,
} from './oidc';
import {
  environmentOidcSecretResolver,
  exchangeOidcAuthorizationCode,
  fetchOidcJwks,
  type OidcFetch,
  type OidcSecretResolver,
} from './oidc-http';
import {
  decryptOidcClientSecretReference,
  recordOidcTenantValidationFromCallback,
} from './oidc-provider-configuration';
import { safeReturnTo } from './safe-return-to';
import type { AppSession } from './session';

export const OIDC_MFA_COOKIE = 'avantime_oidc_mfa';

function jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === 'string' ? [item] : []))
    : [];
}

function claimMapping(value: Prisma.JsonValue | null): Partial<OidcTokenClaimMapping> {
  const record = jsonRecord(value);
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, item]) =>
      typeof item === 'string' ? [[key, item]] : [],
    ),
  ) as Partial<OidcTokenClaimMapping>;
}

function emailDomain(email: string) {
  return normalizeIdentityEmail(email).split('@')[1] ?? '';
}

export function validateOidcTenantMapping(
  provider: {
    oidcProfile: string | null;
    organizationMappingMode: string;
    allowedDomains: Prisma.JsonValue | null;
    tenantMappingPolicy: Prisma.JsonValue | null;
  },
  identity: ValidatedOidcIdentity,
) {
  const domains = stringArray(provider.allowedDomains).map((domain) => domain.toLowerCase());
  const policy = jsonRecord(provider.tenantMappingPolicy);
  if (provider.oidcProfile === 'GOOGLE_WORKSPACE') {
    if (!identity.hostedDomain || !domains.includes(identity.hostedDomain.toLowerCase())) {
      throw new OidcValidationError('HOSTED_DOMAIN_NOT_ALLOWED');
    }
  } else if (domains.length > 0 && !domains.includes(emailDomain(identity.email))) {
    throw new OidcValidationError('EMAIL_DOMAIN_NOT_ALLOWED');
  }
  if (provider.organizationMappingMode === 'PROVIDER_TENANT_CLAIM') {
    const allowedTenantIds = stringArray(policy.allowedTenantIds);
    if (!identity.tenantId || !allowedTenantIds.includes(identity.tenantId)) {
      throw new OidcValidationError('PROVIDER_TENANT_NOT_ALLOWED');
    }
  }
  if (provider.organizationMappingMode === 'HOSTED_DOMAIN') {
    const allowedHostedDomains =
      stringArray(policy.allowedHostedDomains).length > 0
        ? stringArray(policy.allowedHostedDomains)
        : domains;
    if (
      !identity.hostedDomain ||
      !allowedHostedDomains
        .map((value) => value.toLowerCase())
        .includes(identity.hostedDomain.toLowerCase())
    ) {
      throw new OidcValidationError('HOSTED_DOMAIN_NOT_ALLOWED');
    }
  }
  if (provider.organizationMappingMode === 'CLAIM') {
    const allowedValues = stringArray(policy.allowedValues);
    if (!identity.tenantId || !allowedValues.includes(identity.tenantId)) {
      throw new OidcValidationError('ORGANIZATION_CLAIM_NOT_ALLOWED');
    }
  }
}

async function reserveTokenReplay(input: {
  prisma: PrismaClient;
  providerId: string;
  token: string;
  tokenId?: string;
  expiresAt: Date;
}) {
  const tokenIdHash = hashOidcValue(input.tokenId ?? input.token);
  try {
    await input.prisma.oidcTokenReplay.create({
      data: {
        providerId: input.providerId,
        tokenIdHash,
        expiresAt: input.expiresAt,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new OidcValidationError('TOKEN_REPLAYED');
    }
    throw new OidcValidationError('DATABASE_UNAVAILABLE');
  }
}

export type OidcCallbackResult =
  | {
      status: 'AUTHENTICATED';
      identity: Extract<
        Awaited<ReturnType<typeof authenticateExternalIdentity>>,
        { status: 'AUTHENTICATED' }
      >['identity'];
      returnTo?: string;
      providerId: string;
    }
  | {
      status: 'MFA_REQUIRED';
      challengeToken: string;
      enrollmentRequired: boolean;
      returnTo?: string;
      providerId: string;
      userId: string;
      companyId: string | null;
    }
  | { status: 'LINKED'; returnTo: string; providerId: string }
  | { status: 'PROVIDER_VALIDATED'; returnTo: string; providerId: string };

export async function completeOidcCallback(input: {
  state: string;
  code: string;
  redirectUri: string;
  currentSession?: AppSession | null;
  correlationId: string;
  fetcher?: OidcFetch;
  secretResolver?: OidcSecretResolver;
  now?: Date;
}): Promise<OidcCallbackResult> {
  const now = input.now ?? new Date();
  const transaction = await consumeOidcAuthorization({
    state: input.state,
    redirectUri: input.redirectUri,
    now,
  });
  const provider = transaction.provider;
  if (
    !provider.companyId ||
    !provider.issuer ||
    !provider.clientId ||
    !provider.authorizationEndpoint ||
    !provider.tokenEndpoint ||
    !provider.jwksUri ||
    !provider.redirectUri ||
    !provider.clientSecretRefEncrypted
  ) {
    throw new OidcValidationError('PROVIDER_UNAVAILABLE');
  }
  const contract: OidcProviderContract = {
    key: provider.key,
    issuer: provider.issuer,
    clientId: provider.clientId,
    authorizationEndpoint: provider.authorizationEndpoint,
    tokenEndpoint: provider.tokenEndpoint,
    jwksUri: provider.jwksUri,
    redirectUri: provider.redirectUri,
  };
  const secretReference = decryptOidcClientSecretReference(provider.clientSecretRefEncrypted);
  const clientSecret = await (input.secretResolver ?? environmentOidcSecretResolver)(
    secretReference,
  );
  const exchange = await exchangeOidcAuthorizationCode({
    contract,
    code: input.code,
    codeVerifier: transaction.codeVerifier,
    clientSecret,
    fetcher: input.fetcher,
  });
  const jwks = await fetchOidcJwks({
    jwksUri: provider.jwksUri,
    fetcher: input.fetcher,
  });
  const identity = validateOidcIdToken({
    token: exchange.idToken,
    provider: {
      issuer: provider.issuer,
      clientId: provider.clientId,
    },
    jwks,
    expectedNonceHash: transaction.nonceHash,
    claimMapping: claimMapping(provider.claimMapping),
    now,
  });
  validateOidcTenantMapping(provider, identity);
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new OidcValidationError('DATABASE_UNAVAILABLE');
  await reserveTokenReplay({
    prisma,
    providerId: provider.id,
    token: exchange.idToken,
    tokenId: identity.tokenId,
    expiresAt: identity.expiresAt,
  });

  if (transaction.purpose === 'PROVIDER_VALIDATION') {
    const session = input.currentSession;
    if (
      !session ||
      session.role !== 'ADMIN' ||
      session.userId !== transaction.userId ||
      session.companyId !== provider.companyId ||
      session.mfaSatisfied !== true ||
      !session.authenticationAt ||
      now.getTime() - session.authenticationAt > 10 * 60_000
    ) {
      throw new OidcValidationError('VALIDATION_SESSION_MISMATCH');
    }
    const marked = await prisma.oidcAuthorizationRequest.updateMany({
      where: {
        id: transaction.transactionId,
        providerId: provider.id,
        userId: session.userId,
        purpose: 'PROVIDER_VALIDATION',
        consumedAt: { not: null },
        validatedAt: null,
      },
      data: { validatedAt: now },
    });
    if (marked.count !== 1) {
      throw new OidcValidationError('VALIDATION_REPLAYED');
    }
    await recordOidcTenantValidationFromCallback({
      session,
      providerId: provider.id,
      expectedVersion: provider.configurationVersion,
      authorizationRequestId: transaction.transactionId,
      correlationId: input.correlationId,
      now,
    });
    return {
      status: 'PROVIDER_VALIDATED',
      returnTo: `/portal/settings/security/identity-providers/${provider.id}`,
      providerId: provider.id,
    };
  }

  if (transaction.purpose === 'LINK') {
    const session = input.currentSession;
    if (
      !session ||
      !transaction.userId ||
      session.userId !== transaction.userId ||
      session.companyId !== provider.companyId ||
      !session.authenticationAt
    ) {
      throw new OidcValidationError('LINK_SESSION_MISMATCH');
    }
    const existing = await prisma.externalIdentity.findUnique({
      where: {
        providerId_subject: {
          providerId: provider.id,
          subject: identity.subject,
        },
      },
      select: { id: true, userId: true },
    });
    if (existing && existing.userId !== session.userId) {
      throw new OidcValidationError('EXTERNAL_IDENTITY_ALREADY_LINKED');
    }
    if (existing) {
      await prisma.externalIdentity.update({
        where: { id: existing.id },
        data: {
          emailNormalized: normalizeIdentityEmail(identity.email),
          emailVerified: true,
          lastAuthenticatedAt: now,
        },
      });
    } else {
      await linkExternalIdentity({
        session,
        providerKey: provider.key,
        assertion: identity,
        reauthentication: {
          userId: session.userId,
          authenticatedAt: new Date(session.authenticationAt),
          method: 'PASSWORD',
        },
        correlationId: input.correlationId,
        now,
      });
    }
    return {
      status: 'LINKED',
      returnTo: '/portal/settings/security',
      providerId: provider.id,
    };
  }

  if (transaction.userId) {
    throw new OidcValidationError('LOGIN_TRANSACTION_INVALID');
  }

  const authentication = await authenticateExternalIdentity({
    providerId: provider.id,
    subject: identity.subject,
    redirectTo: safeReturnTo(transaction.returnTo ?? undefined),
    now,
  });
  if (authentication.status === 'INVALID') {
    await recordIdentitySecurityEvent({
      context: {
        userId: null,
        companyId: provider.companyId,
        correlationId: input.correlationId,
      },
      action: 'identity.login.failure',
      result: 'DENIED',
      metadata: {
        reasonCode: 'OIDC_IDENTITY_NOT_PRELINKED',
        providerId: provider.id,
      },
      target: { type: 'identity-provider', id: provider.id },
    });
    throw new OidcValidationError('EXTERNAL_IDENTITY_NOT_PRELINKED');
  }
  if (authentication.status === 'UNAVAILABLE') {
    throw new OidcValidationError('DATABASE_UNAVAILABLE');
  }
  await prisma.externalIdentity.updateMany({
    where: { providerId: provider.id, subject: identity.subject },
    data: {
      emailNormalized: normalizeIdentityEmail(identity.email),
      emailVerified: true,
      lastAuthenticatedAt: now,
    },
  });
  if (authentication.status === 'MFA_REQUIRED') {
    return {
      ...authentication,
      returnTo: safeReturnTo(transaction.returnTo ?? undefined),
      providerId: provider.id,
    };
  }
  return {
    status: 'AUTHENTICATED',
    identity: authentication.identity,
    returnTo: safeReturnTo(transaction.returnTo ?? undefined),
    providerId: provider.id,
  };
}
