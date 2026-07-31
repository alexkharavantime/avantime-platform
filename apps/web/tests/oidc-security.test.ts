import assert from 'node:assert/strict';
import test from 'node:test';

import { denyEmailOnlyIdentityLinking } from '../lib/external-identity';
import { validateOidcTenantMapping } from '../lib/oidc-flow';
import {
  assertOidcNetworkUrl,
  discoverOidcProvider,
  exchangeOidcAuthorizationCode,
} from '../lib/oidc-http';
import {
  OidcProviderConfigurationError,
  validateOidcProviderConfigurationInput,
} from '../lib/oidc-provider-configuration';
import { parseOidcProviderConfiguration } from '../lib/oidc-provider-route';
import {
  buildOidcAuthorizationRequest,
  createDeterministicMockOidcIdp,
  createPkcePair,
  OidcValidationError,
  validateOidcIdToken,
  validateOidcProviderContract,
} from '../lib/oidc';

const NOW = new Date('2026-07-30T12:00:00.000Z');
const provider = {
  key: 'mock-oidc',
  issuer: 'https://mock-idp.example.test',
  clientId: 'avantime-mock-client',
  authorizationEndpoint: 'https://mock-idp.example.test/authorize',
  tokenEndpoint: 'https://mock-idp.example.test/token',
  jwksUri: 'https://mock-idp.example.test/jwks',
  redirectUri: 'https://portal.example.test/api/auth/oidc/callback',
};

function expectOidcError(operation: () => unknown, code: string) {
  assert.throws(operation, (error: unknown) => {
    assert.equal(error instanceof OidcValidationError, true);
    assert.equal((error as OidcValidationError).code, code);
    return true;
  });
}

test('OIDC authorization contract uses code flow, S256 PKCE, state, nonce and exact redirect', () => {
  assert.deepEqual(validateOidcProviderContract(provider), provider);
  const request = buildOidcAuthorizationRequest(provider, provider.redirectUri);
  const url = new URL(request.authorizationUrl);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), request.state);
  assert.equal(url.searchParams.get('nonce'), request.nonce);
  assert.equal(url.searchParams.get('redirect_uri'), provider.redirectUri);
  assert.equal(request.stateHash.length, 64);
  assert.equal(request.nonceHash.length, 64);
  const pkce = createPkcePair();
  assert.ok(pkce.verifier.length >= 43);
  assert.equal(pkce.challenge.length, 43);
  expectOidcError(
    () => buildOidcAuthorizationRequest(provider, 'https://portal.example.test/other'),
    'REDIRECT_URI_MISMATCH',
  );
});

test('OIDC ID token validator enforces signature, issuer, audience, nonce and time', () => {
  const idp = createDeterministicMockOidcIdp({ now: NOW });
  const nonce = 'expected-nonce';
  const token = idp.issueToken({
    subject: 'subject-1',
    email: 'verified@example.test',
    nonce,
  });
  const replayCache = new Set<string>();
  assert.deepEqual(
    validateOidcIdToken({
      token,
      provider,
      jwks: idp.jwks,
      expectedNonce: nonce,
      now: NOW,
      replayCache,
    }),
    {
      subject: 'subject-1',
      email: 'verified@example.test',
      emailVerified: true,
      issuer: idp.issuer,
      audience: idp.clientId,
      tokenId: 'mock-subject-1',
      expiresAt: new Date('2026-07-30T12:05:00.000Z'),
      tenantId: undefined,
      hostedDomain: undefined,
      groups: [],
    },
  );
  expectOidcError(
    () =>
      validateOidcIdToken({
        token,
        provider,
        jwks: idp.jwks,
        expectedNonce: nonce,
        now: NOW,
        replayCache,
      }),
    'TOKEN_REPLAYED',
  );
  expectOidcError(
    () =>
      validateOidcIdToken({
        token: idp.issueToken({
          subject: 'subject-2',
          email: 'verified@example.test',
          nonce,
          issuerOverride: 'https://evil.example.test',
        }),
        provider,
        jwks: idp.jwks,
        expectedNonce: nonce,
        now: NOW,
      }),
    'ISSUER_MISMATCH',
  );
  expectOidcError(
    () =>
      validateOidcIdToken({
        token: idp.issueToken({
          subject: 'subject-3',
          email: 'verified@example.test',
          nonce,
          audienceOverride: 'other-client',
        }),
        provider,
        jwks: idp.jwks,
        expectedNonce: nonce,
        now: NOW,
      }),
    'AUDIENCE_MISMATCH',
  );
  expectOidcError(
    () =>
      validateOidcIdToken({
        token,
        provider,
        jwks: idp.jwks,
        expectedNonce: 'wrong-nonce',
        now: NOW,
      }),
    'NONCE_MISMATCH',
  );
});

test('OIDC ID token validator rejects unverified email, disallowed alg and expired tokens', () => {
  const idp = createDeterministicMockOidcIdp({ now: NOW });
  const base = { subject: 'subject', email: 'user@example.test', nonce: 'nonce' };
  expectOidcError(
    () =>
      validateOidcIdToken({
        token: idp.issueToken({ ...base, emailVerified: false }),
        provider,
        jwks: idp.jwks,
        expectedNonce: base.nonce,
        now: NOW,
      }),
    'EMAIL_NOT_VERIFIED',
  );
  expectOidcError(
    () =>
      validateOidcIdToken({
        token: idp.issueToken({ ...base, algorithm: 'none' }),
        provider,
        jwks: idp.jwks,
        expectedNonce: base.nonce,
        now: NOW,
      }),
    'ALGORITHM_NOT_ALLOWED',
  );
  expectOidcError(
    () =>
      validateOidcIdToken({
        token: idp.issueToken({ ...base, expiresInSeconds: -120 }),
        provider,
        jwks: idp.jwks,
        expectedNonce: base.nonce,
        now: NOW,
      }),
    'TOKEN_TIME_INVALID',
  );
});

test('external identity cannot be linked from an email match alone', () => {
  assert.throws(() => denyEmailOnlyIdentityLinking(), /cannot be linked by email match alone/u);
});

test('OIDC code exchange sends PKCE and secret only to the exact token endpoint', async () => {
  let submittedBody = '';
  const result = await exchangeOidcAuthorizationCode({
    contract: provider,
    code: 'authorization-code',
    codeVerifier: 'v'.repeat(64),
    clientSecret: 'server-side-secret',
    environment: { NODE_ENV: 'test' },
    fetcher: async (url, init) => {
      assert.equal(url, provider.tokenEndpoint);
      assert.equal(init?.method, 'POST');
      submittedBody = String(init?.body);
      return Response.json({
        id_token: 'header.payload.signature',
        access_token: 'must-not-leave-token-exchange',
        refresh_token: 'must-not-be-persisted',
      });
    },
  });
  const form = new URLSearchParams(submittedBody);
  assert.equal(form.get('grant_type'), 'authorization_code');
  assert.equal(form.get('code'), 'authorization-code');
  assert.equal(form.get('code_verifier'), 'v'.repeat(64));
  assert.equal(form.get('client_secret'), 'server-side-secret');
  assert.deepEqual(result, { idToken: 'header.payload.signature' });
});

test('OIDC discovery rejects issuer substitution and production endpoints outside allowlist', async () => {
  await assert.rejects(
    () =>
      discoverOidcProvider({
        discoveryUrl: 'https://idp.example.test/.well-known/openid-configuration',
        expectedIssuer: provider.issuer,
        clientId: provider.clientId,
        redirectUri: provider.redirectUri,
        providerKey: provider.key,
        environment: { NODE_ENV: 'test' },
        fetcher: async () =>
          Response.json({
            issuer: 'https://evil.example.test',
            authorization_endpoint: provider.authorizationEndpoint,
            token_endpoint: provider.tokenEndpoint,
            jwks_uri: provider.jwksUri,
          }),
      }),
    (error: unknown) =>
      error instanceof OidcValidationError && error.code === 'OIDC_DISCOVERY_MISMATCH',
  );
  expectOidcError(
    () =>
      assertOidcNetworkUrl(provider.tokenEndpoint, {
        NODE_ENV: 'production',
        OIDC_ALLOWED_HOSTS: 'approved-idp.example.test',
      }),
    'OIDC_ENDPOINT_NOT_ALLOWLISTED',
  );
});

test('tenant mapping uses Entra tid and Google hosted-domain claims, never email alone', () => {
  const baseIdentity = {
    subject: 'subject',
    email: 'user@example.test',
    emailVerified: true as const,
    issuer: provider.issuer,
    audience: provider.clientId,
    expiresAt: new Date('2026-07-30T12:05:00.000Z'),
    groups: [],
  };
  assert.doesNotThrow(() =>
    validateOidcTenantMapping(
      {
        oidcProfile: 'MICROSOFT_ENTRA_ID',
        organizationMappingMode: 'PROVIDER_TENANT_CLAIM',
        allowedDomains: ['example.test'],
        tenantMappingPolicy: { allowedTenantIds: ['entra-tenant-a'] },
      },
      { ...baseIdentity, tenantId: 'entra-tenant-a' },
    ),
  );
  expectOidcError(
    () =>
      validateOidcTenantMapping(
        {
          oidcProfile: 'MICROSOFT_ENTRA_ID',
          organizationMappingMode: 'PROVIDER_TENANT_CLAIM',
          allowedDomains: ['example.test'],
          tenantMappingPolicy: { allowedTenantIds: ['entra-tenant-a'] },
        },
        { ...baseIdentity, tenantId: 'entra-tenant-b' },
      ),
    'PROVIDER_TENANT_NOT_ALLOWED',
  );
  expectOidcError(
    () =>
      validateOidcTenantMapping(
        {
          oidcProfile: 'GOOGLE_WORKSPACE',
          organizationMappingMode: 'HOSTED_DOMAIN',
          allowedDomains: ['example.test'],
          tenantMappingPolicy: {},
        },
        baseIdentity,
      ),
    'HOSTED_DOMAIN_NOT_ALLOWED',
  );
  assert.doesNotThrow(() =>
    validateOidcTenantMapping(
      {
        oidcProfile: 'GOOGLE_WORKSPACE',
        organizationMappingMode: 'HOSTED_DOMAIN',
        allowedDomains: ['example.test'],
        tenantMappingPolicy: {},
      },
      { ...baseIdentity, hostedDomain: 'example.test' },
    ),
  );
});

test('provider configuration enforces tenant mapping and rejects client tenant identifiers', () => {
  const configuration = {
    key: 'enterprise-oidc',
    profile: 'MICROSOFT_ENTRA_ID' as const,
    displayName: 'Enterprise OIDC',
    issuer: 'https://login.microsoftonline.com/tenant-a/v2.0',
    discoveryUrl:
      'https://login.microsoftonline.com/tenant-a/v2.0/.well-known/openid-configuration',
    clientId: 'client-id',
    clientSecretReference: 'env:OIDC_CLIENT_SECRET',
    redirectUris: ['https://portal.example.test/api/auth/oidc/callback'],
    allowedEmailDomains: ['example.test'],
    organizationMappingMode: 'PROVIDER_TENANT_CLAIM' as const,
    tenantMappingPolicy: { allowedTenantIds: ['tenant-a'] },
    claimMapping: {},
    groupMapping: {},
    defaultRole: 'CLIENT' as const,
    sessionPolicy: 'REVOKE_ON_DISABLE' as const,
  };
  assert.equal(validateOidcProviderConfigurationInput(configuration).key, configuration.key);
  assert.throws(
    () =>
      validateOidcProviderConfigurationInput({
        ...configuration,
        tenantMappingPolicy: {},
      }),
    (error: unknown) =>
      error instanceof OidcProviderConfigurationError &&
      error.code === 'ENTRA_ALLOWED_TENANT_IDS_REQUIRED',
  );
  assert.equal(
    parseOidcProviderConfiguration({
      ...configuration,
      companyId: 'client-selected-company',
    }),
    null,
  );
});
