import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
  type JsonWebKey as NodeJsonWebKey,
} from 'node:crypto';
import { getPrisma } from '@avantime/database';
import type { Prisma, PrismaClient } from '@prisma/client';

import { decryptIdentitySecret, encryptIdentitySecret } from './identity-encryption';

const OIDC_TRANSACTION_TTL_MS = 5 * 60_000;
const OIDC_CLOCK_SKEW_SECONDS = 60;
const OIDC_ALGORITHMS = new Set(['RS256']);

type JsonWebKeyWithKid = NodeJsonWebKey & { kid: string; alg?: string; use?: string };

export type OidcProviderContract = {
  key: string;
  issuer: string;
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  redirectUri: string;
};

export type ValidatedOidcIdentity = {
  subject: string;
  email: string;
  emailVerified: true;
  issuer: string;
  audience: string;
  tokenId?: string;
  expiresAt: Date;
  tenantId?: string;
  hostedDomain?: string;
  groups: string[];
};

export type OidcTokenClaimMapping = {
  subject: string;
  email: string;
  emailVerified: string;
  tenant: string;
  groups: string;
  hostedDomain: string;
};

export class OidcValidationError extends Error {
  constructor(readonly code: string) {
    super('OIDC validation failed.');
  }
}

export function hashOidcValue(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function equalText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseJsonPart(value: string) {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new OidcValidationError('MALFORMED_TOKEN');
  }
}

function validHttpsUrl(value: string, allowMockLoopback = false) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return (
      allowMockLoopback &&
      url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    );
  } catch {
    return false;
  }
}

export function validateOidcProviderContract(
  provider: OidcProviderContract,
  options: { allowMockLoopback?: boolean } = {},
) {
  const urls = [
    provider.issuer,
    provider.authorizationEndpoint,
    provider.tokenEndpoint,
    provider.jwksUri,
    provider.redirectUri,
  ];
  if (
    !/^[a-z0-9][a-z0-9._-]{1,99}$/u.test(provider.key) ||
    !provider.clientId ||
    provider.clientId.length > 300 ||
    urls.some((value) => !validHttpsUrl(value, options.allowMockLoopback))
  ) {
    throw new OidcValidationError('INVALID_PROVIDER_CONFIGURATION');
  }
  return provider;
}

export function createPkcePair() {
  const verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, method: 'S256' as const };
}

export function buildOidcAuthorizationRequest(provider: OidcProviderContract, redirectUri: string) {
  validateOidcProviderContract(provider, {
    allowMockLoopback: process.env.NODE_ENV !== 'production',
  });
  if (!equalText(redirectUri, provider.redirectUri)) {
    throw new OidcValidationError('REDIRECT_URI_MISMATCH');
  }
  const state = randomToken();
  const nonce = randomToken();
  const pkce = createPkcePair();
  const url = new URL(provider.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', provider.clientId);
  url.searchParams.set('redirect_uri', provider.redirectUri);
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', pkce.method);
  return {
    authorizationUrl: url.toString(),
    state,
    stateHash: hashOidcValue(state),
    nonce,
    nonceHash: hashOidcValue(nonce),
    codeVerifier: pkce.verifier,
  };
}

export async function beginOidcAuthorization(input: {
  providerKey: string;
  redirectUri: string;
  userId?: string;
  companyId?: string | null;
  purpose?: 'LOGIN' | 'LINK' | 'PROVIDER_VALIDATION';
  returnTo?: string;
  now?: Date;
}) {
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new OidcValidationError('DATABASE_UNAVAILABLE');
  const provider = await prisma.identityProvider.findUnique({
    where: { key: input.providerKey },
  });
  const purpose = input.purpose ?? 'LOGIN';
  const activeLogin = provider?.enabled && provider.validationStatus === 'TENANT_VALIDATED';
  const providerValidation =
    purpose === 'PROVIDER_VALIDATION' &&
    provider?.enabled === false &&
    provider.validationStatus === 'METADATA_VALIDATED';
  if (
    !provider ||
    (!activeLogin && !providerValidation) ||
    provider.kind !== 'OIDC' ||
    !provider.metadataExpiresAt ||
    provider.metadataExpiresAt <= (input.now ?? new Date()) ||
    !provider.companyId ||
    (purpose !== 'LOGIN' && (!input.userId || provider.companyId !== input.companyId)) ||
    !provider.issuer ||
    !provider.clientId ||
    !provider.authorizationEndpoint ||
    !provider.tokenEndpoint ||
    !provider.jwksUri ||
    !provider.redirectUri
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
  const request = buildOidcAuthorizationRequest(contract, input.redirectUri);
  const now = input.now ?? new Date();
  await prisma.oidcAuthorizationRequest.create({
    data: {
      providerId: provider.id,
      userId: input.userId ?? null,
      purpose,
      stateHash: request.stateHash,
      nonceHash: request.nonceHash,
      pkceVerifierEncrypted: encryptIdentitySecret(request.codeVerifier, 'oidc-pkce'),
      redirectUri: provider.redirectUri,
      returnTo: input.returnTo ?? null,
      expiresAt: new Date(now.getTime() + OIDC_TRANSACTION_TTL_MS),
    },
  });
  return {
    authorizationUrl: request.authorizationUrl,
    state: request.state,
    nonce: request.nonce,
  };
}

export async function consumeOidcAuthorization(input: {
  providerKey?: string;
  state: string;
  redirectUri: string;
  now?: Date;
}) {
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new OidcValidationError('DATABASE_UNAVAILABLE');
  const now = input.now ?? new Date();
  const transaction = await prisma.oidcAuthorizationRequest.findUnique({
    where: { stateHash: hashOidcValue(input.state) },
    include: { provider: true },
  });
  const providerEligible =
    transaction?.purpose === 'PROVIDER_VALIDATION'
      ? !transaction.provider.enabled &&
        transaction.provider.validationStatus === 'METADATA_VALIDATED'
      : transaction?.provider.enabled &&
        transaction.provider.validationStatus === 'TENANT_VALIDATED';
  if (
    !transaction ||
    (input.providerKey && transaction.provider.key !== input.providerKey) ||
    !providerEligible ||
    transaction.consumedAt ||
    transaction.expiresAt <= now ||
    !equalText(transaction.redirectUri, input.redirectUri)
  ) {
    throw new OidcValidationError('INVALID_OR_EXPIRED_STATE');
  }
  await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    const consumed = await database.oidcAuthorizationRequest.updateMany({
      where: { id: transaction.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw new OidcValidationError('STATE_REPLAYED');
  });
  return {
    userId: transaction.userId,
    purpose: transaction.purpose,
    returnTo: transaction.returnTo,
    provider: transaction.provider,
    transactionId: transaction.id,
    nonceHash: transaction.nonceHash,
    codeVerifier: decryptIdentitySecret(transaction.pkceVerifierEncrypted, 'oidc-pkce'),
  };
}

function audienceMatches(value: unknown, expected: string) {
  return typeof value === 'string'
    ? equalText(value, expected)
    : Array.isArray(value) &&
        value.some((candidate) => typeof candidate === 'string' && equalText(candidate, expected));
}

export function validateOidcIdToken(input: {
  token: string;
  provider: Pick<OidcProviderContract, 'issuer' | 'clientId'>;
  jwks: { keys: JsonWebKeyWithKid[] };
  expectedNonce?: string;
  expectedNonceHash?: string;
  now?: Date;
  replayCache?: Set<string>;
  claimMapping?: Partial<OidcTokenClaimMapping>;
}) {
  const parts = input.token.split('.');
  if (parts.length !== 3) throw new OidcValidationError('MALFORMED_TOKEN');
  const header = parseJsonPart(parts[0]);
  const claims = parseJsonPart(parts[1]);
  if (typeof header.alg !== 'string' || !OIDC_ALGORITHMS.has(header.alg)) {
    throw new OidcValidationError('ALGORITHM_NOT_ALLOWED');
  }
  if (typeof header.kid !== 'string') throw new OidcValidationError('MISSING_KEY_ID');
  const jwk = input.jwks.keys.find(
    (candidate) =>
      candidate.kid === header.kid &&
      (!candidate.alg || candidate.alg === header.alg) &&
      (!candidate.use || candidate.use === 'sig'),
  );
  if (!jwk) throw new OidcValidationError('SIGNING_KEY_UNAVAILABLE');
  const signatureValid = verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey({ key: jwk as NodeJsonWebKey, format: 'jwk' }),
    Buffer.from(parts[2], 'base64url'),
  );
  if (!signatureValid) throw new OidcValidationError('INVALID_SIGNATURE');

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!equalText(String(claims.iss ?? ''), input.provider.issuer)) {
    throw new OidcValidationError('ISSUER_MISMATCH');
  }
  if (!audienceMatches(claims.aud, input.provider.clientId)) {
    throw new OidcValidationError('AUDIENCE_MISMATCH');
  }
  if (
    Array.isArray(claims.aud) &&
    (typeof claims.azp !== 'string' || !equalText(claims.azp, input.provider.clientId))
  ) {
    throw new OidcValidationError('AUTHORIZED_PARTY_MISMATCH');
  }
  if (
    typeof claims.exp !== 'number' ||
    claims.exp < nowSeconds - OIDC_CLOCK_SKEW_SECONDS ||
    (typeof claims.iat === 'number' && claims.iat > nowSeconds + OIDC_CLOCK_SKEW_SECONDS) ||
    (typeof claims.nbf === 'number' && claims.nbf > nowSeconds + OIDC_CLOCK_SKEW_SECONDS)
  ) {
    throw new OidcValidationError('TOKEN_TIME_INVALID');
  }
  const nonce = typeof claims.nonce === 'string' ? claims.nonce : '';
  const expectedNonceHash =
    input.expectedNonceHash ?? (input.expectedNonce ? hashOidcValue(input.expectedNonce) : '');
  if (!expectedNonceHash || !equalText(hashOidcValue(nonce), expectedNonceHash)) {
    throw new OidcValidationError('NONCE_MISMATCH');
  }
  const mapping: OidcTokenClaimMapping = {
    subject: 'sub',
    email: 'email',
    emailVerified: 'email_verified',
    tenant: 'tid',
    groups: 'groups',
    hostedDomain: 'hd',
    ...input.claimMapping,
  };
  const subject = claims[mapping.subject];
  const email = claims[mapping.email];
  if (claims[mapping.emailVerified] !== true || typeof email !== 'string') {
    throw new OidcValidationError('EMAIL_NOT_VERIFIED');
  }
  if (typeof subject !== 'string' || !subject || subject.length > 500) {
    throw new OidcValidationError('SUBJECT_INVALID');
  }
  const tokenId = typeof claims.jti === 'string' ? claims.jti : undefined;
  if (tokenId && input.replayCache) {
    if (input.replayCache.has(tokenId)) throw new OidcValidationError('TOKEN_REPLAYED');
    input.replayCache.add(tokenId);
  }
  return {
    subject,
    email,
    emailVerified: true,
    issuer: claims.iss as string,
    audience: input.provider.clientId,
    tokenId,
    expiresAt: new Date((claims.exp as number) * 1000),
    tenantId:
      typeof claims[mapping.tenant] === 'string' ? (claims[mapping.tenant] as string) : undefined,
    hostedDomain:
      typeof claims[mapping.hostedDomain] === 'string'
        ? (claims[mapping.hostedDomain] as string)
        : undefined,
    groups: Array.isArray(claims[mapping.groups])
      ? (claims[mapping.groups] as unknown[]).flatMap((value) =>
          typeof value === 'string' && value.length <= 200 ? [value] : [],
        )
      : [],
  } satisfies ValidatedOidcIdentity;
}

export function createDeterministicMockOidcIdp(
  options: {
    issuer?: string;
    clientId?: string;
    now?: Date;
  } = {},
) {
  const issuer = options.issuer ?? 'https://mock-idp.example.test';
  const clientId = options.clientId ?? 'avantime-mock-client';
  const now = options.now ?? new Date('2026-07-30T12:00:00.000Z');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'mock-rotation-key-1';
  const jwk = publicKey.export({ format: 'jwk' }) as unknown as JsonWebKeyWithKid;
  Object.assign(jwk, { kid, alg: 'RS256', use: 'sig' });
  return {
    issuer,
    clientId,
    jwks: { keys: [jwk] },
    issueToken(input: {
      subject: string;
      email: string;
      nonce: string;
      tokenId?: string;
      expiresInSeconds?: number;
      emailVerified?: boolean;
      issuerOverride?: string;
      audienceOverride?: string;
      notBeforeOffsetSeconds?: number;
      algorithm?: 'RS256' | 'none';
      tenantId?: string;
      hostedDomain?: string;
      groups?: string[];
      additionalClaims?: Record<string, string | string[] | boolean>;
    }) {
      const header = {
        alg: input.algorithm ?? 'RS256',
        typ: 'JWT',
        kid,
      };
      const nowSeconds = Math.floor(now.getTime() / 1000);
      const claims = {
        iss: input.issuerOverride ?? issuer,
        aud: input.audienceOverride ?? clientId,
        sub: input.subject,
        email: input.email,
        email_verified: input.emailVerified ?? true,
        nonce: input.nonce,
        jti: input.tokenId ?? `mock-${input.subject}`,
        iat: nowSeconds,
        nbf: nowSeconds + (input.notBeforeOffsetSeconds ?? 0),
        exp: nowSeconds + (input.expiresInSeconds ?? 300),
        ...(input.tenantId ? { tid: input.tenantId } : {}),
        ...(input.hostedDomain ? { hd: input.hostedDomain } : {}),
        ...(input.groups ? { groups: input.groups } : {}),
        ...input.additionalClaims,
      };
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
      const encodedClaims = Buffer.from(JSON.stringify(claims)).toString('base64url');
      const signingInput = `${encodedHeader}.${encodedClaims}`;
      const signature =
        header.alg === 'RS256'
          ? sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url')
          : '';
      return `${signingInput}.${signature}`;
    },
  };
}
