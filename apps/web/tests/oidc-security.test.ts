import assert from 'node:assert/strict';
import test from 'node:test';

import { denyEmailOnlyIdentityLinking } from '../lib/external-identity';
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
