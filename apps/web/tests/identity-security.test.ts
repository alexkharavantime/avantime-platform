import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { isSameOriginMutation } from '../lib/identity-auth';
import { sendIdentityEmail } from '../lib/identity-email';
import { evaluateMfaPolicy, isOrganizationLoginMethodAllowed } from '../lib/identity-policy';
import { MemoryIdentityRateLimiter } from '../lib/identity-rate-limit';
import { identityTestResponseEnabled, parseIdentityMutation } from '../lib/identity-route';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpAtCounter,
  verifyTotp,
} from '../lib/mfa';
import {
  hashPassword,
  PASSWORD_POLICY,
  validatePasswordPolicy,
  verifyPasswordVersioned,
} from '../lib/password';
import {
  createOpaqueSessionToken,
  createUserSession,
  hashSessionToken,
  resetMemorySessionsForTests,
  resolveSessionToken,
  revokeSessionToken,
  sessionCookieOptions,
} from '../lib/session';

const MFA_ENVIRONMENT = {
  MFA_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
  MFA_ENCRYPTION_KEY_VERSION: 'test-v1',
};

test('password policy enforces length, common-password, email, and maximum bounds', () => {
  assert.equal(validatePasswordPolicy('short').valid, false);
  assert.equal(validatePasswordPolicy('password1234').valid, false);
  assert.equal(
    validatePasswordPolicy('customer-strong-secret', 'customer@example.test').valid,
    false,
  );
  assert.equal(
    validatePasswordPolicy('correct horse battery staple', 'user@example.test').valid,
    true,
  );
  assert.equal(validatePasswordPolicy('x'.repeat(PASSWORD_POLICY.maximumLength + 1)).valid, false);
});

test('current password hashes are versioned scrypt and legacy PBKDF2 requests rehash', () => {
  const password = 'correct horse battery staple';
  const current = hashPassword(password);
  assert.match(current, /^scrypt\$v1\$/u);
  assert.deepEqual(verifyPasswordVersioned(password, current), {
    valid: true,
    needsRehash: false,
  });
  assert.equal(verifyPasswordVersioned('wrong password value', current).valid, false);

  const salt = 'legacy-test-salt';
  const digest = pbkdf2Sync(password, salt, 210_000, 32, 'sha256').toString('hex');
  assert.deepEqual(verifyPasswordVersioned(password, `pbkdf2$210000$${salt}$${digest}`), {
    valid: true,
    needsRehash: true,
  });
  assert.equal(
    verifyPasswordVersioned(password, `pbkdf2$999999999$${salt}$${digest}`).valid,
    false,
  );
});

test('session token is opaque, hashed at rest, and resolved from server-side state', async () => {
  resetMemorySessionsForTests();
  const token = createOpaqueSessionToken();
  assert.match(token, /^ats_[a-zA-Z0-9_-]{43}$/u);
  assert.equal(token.includes('user@example.test'), false);
  assert.equal(hashSessionToken(token).length, 64);
  assert.deepEqual(sessionCookieOptions({ NODE_ENV: 'production' }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 28_800,
  });

  const created = await createUserSession(
    {
      userId: 'identity-user',
      name: 'Identity User',
      company: 'Tenant A',
      companyId: 'tenant-a',
      email: 'user@example.test',
      role: 'CLIENT',
      mfaSatisfied: true,
    },
    { databaseConfigured: false, userAgent: 'Mozilla/5.0 Chrome/120 Linux' },
  );
  const resolved = await resolveSessionToken(created.token, {
    databaseConfigured: false,
  });
  assert.equal(resolved?.userId, 'identity-user');
  assert.equal(resolved?.companyId, 'tenant-a');
  await revokeSessionToken(created.token);
  assert.equal(await resolveSessionToken(created.token, { databaseConfigured: false }), null);
});

test('TOTP secret is encrypted at rest and OTP replay is rejected', () => {
  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret, MFA_ENVIRONMENT);
  assert.match(encrypted, /^v2\.test-v1\./u);
  assert.equal(encrypted.includes(secret), false);
  assert.equal(decryptTotpSecret(encrypted, MFA_ENVIRONMENT), secret);

  const now = new Date('2026-07-30T12:00:00.000Z');
  const counter = Math.floor(now.getTime() / 1000 / 30);
  const code = totpAtCounter(secret, counter);
  const verified = verifyTotp(secret, code, { now });
  assert.equal(verified.valid, true);
  assert.equal(
    verifyTotp(secret, code, {
      now,
      lastUsedCounter: verified.valid ? verified.counter : null,
    }).valid,
    false,
  );
  assert.equal(verifyTotp(secret, totpAtCounter(secret, counter - 1), { now }).valid, true);
  assert.equal(verifyTotp(secret, totpAtCounter(secret, counter - 2), { now }).valid, false);
});

test('identity encryption supports explicit key rotation without a production default', () => {
  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret, MFA_ENVIRONMENT);
  const rotatedEnvironment = {
    MFA_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    MFA_ENCRYPTION_KEY_VERSION: 'test-v2',
    MFA_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({
      'test-v1': MFA_ENVIRONMENT.MFA_ENCRYPTION_KEY,
    }),
  };
  assert.equal(decryptTotpSecret(encrypted, rotatedEnvironment), secret);
  assert.throws(
    () =>
      decryptTotpSecret(encrypted, {
        MFA_ENCRYPTION_KEY: rotatedEnvironment.MFA_ENCRYPTION_KEY,
        MFA_ENCRYPTION_KEY_VERSION: rotatedEnvironment.MFA_ENCRYPTION_KEY_VERSION,
      }),
    /key version is unavailable/u,
  );
});

test('recovery codes are unique, high-entropy values and only hashes are stable', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) {
    assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/u);
    const hash = hashRecoveryCode(code);
    assert.equal(hash.length, 64);
    assert.equal(hash.includes(code), false);
    assert.equal(hashRecoveryCode(code.toLowerCase().replaceAll('-', '')), hash);
  }
});

test('tenant MFA policy respects enforcement, grace, explicit exemption, and active method', () => {
  const now = new Date('2026-07-30T12:00:00.000Z');
  assert.deepEqual(evaluateMfaPolicy({ role: 'CLIENT', hasActiveMfa: false, now }), {
    challengeRequired: false,
    enrollmentRequired: false,
    policyRequired: false,
    reason: 'OPTIONAL',
  });
  assert.equal(
    evaluateMfaPolicy({
      role: 'ADMIN',
      hasActiveMfa: false,
      now,
      requireAdminMfa: true,
    }).enrollmentRequired,
    true,
  );
  assert.equal(
    evaluateMfaPolicy({
      role: 'CLIENT',
      organizationRole: 'OWNER',
      hasActiveMfa: false,
      now,
      requireAdminMfa: true,
    }).enrollmentRequired,
    true,
  );
  assert.equal(
    evaluateMfaPolicy({
      role: 'CLIENT',
      organizationRole: 'ADMIN',
      hasActiveMfa: false,
      now,
      policy: {
        mfaRequirement: 'ADMINS',
        gracePeriodDays: 0,
        enforcementAt: new Date('2026-07-01T12:00:00.000Z'),
      },
    }).policyRequired,
    true,
  );
  assert.equal(
    evaluateMfaPolicy({
      role: 'CLIENT',
      hasActiveMfa: false,
      now,
      policy: {
        mfaRequirement: 'ALL_MEMBERS',
        gracePeriodDays: 7,
        enforcementAt: new Date('2026-07-25T12:00:00.000Z'),
      },
    }).policyRequired,
    false,
  );
  assert.equal(
    evaluateMfaPolicy({
      role: 'CLIENT',
      hasActiveMfa: false,
      now,
      policy: {
        mfaRequirement: 'ALL_MEMBERS',
        gracePeriodDays: 0,
        enforcementAt: new Date('2026-07-01T12:00:00.000Z'),
      },
      exemption: { expiresAt: new Date('2026-08-01T00:00:00.000Z') },
    }).policyRequired,
    false,
  );
  assert.equal(
    evaluateMfaPolicy({ role: 'CLIENT', hasActiveMfa: true, now }).challengeRequired,
    true,
  );
});

test('organization SSO policy controls local and provider login after enforcement', () => {
  const now = new Date('2026-07-31T12:00:00.000Z');
  const required = {
    ssoRequirement: 'REQUIRED' as const,
    ssoProviderId: 'provider-a',
    ssoEnforcementAt: new Date('2026-07-30T12:00:00.000Z'),
    ssoGracePeriodDays: 0,
    localLoginAllowed: false,
  };
  assert.equal(
    isOrganizationLoginMethodAllowed({
      policy: required,
      method: 'OIDC',
      providerId: 'provider-a',
      now,
    }),
    true,
  );
  assert.equal(
    isOrganizationLoginMethodAllowed({
      policy: required,
      method: 'OIDC',
      providerId: 'provider-b',
      now,
    }),
    false,
  );
  assert.equal(isOrganizationLoginMethodAllowed({ policy: required, method: 'LOCAL', now }), false);
  assert.equal(
    isOrganizationLoginMethodAllowed({
      policy: { ...required, localLoginAllowed: true },
      method: 'LOCAL',
      now: new Date('2026-07-29T12:00:00.000Z'),
    }),
    true,
  );
});

test('identity mutation enforces same-origin and rejects client tenant identifiers', async () => {
  assert.equal(
    identityTestResponseEnabled({ NODE_ENV: 'production', IDENTITY_TEST_MODE: 'browser' }),
    false,
  );
  assert.equal(
    identityTestResponseEnabled({ NODE_ENV: 'development', IDENTITY_TEST_MODE: 'browser' }),
    true,
  );
  assert.equal(
    isSameOriginMutation(
      new Request('https://portal.example.test/api/auth/login', {
        method: 'POST',
        headers: { origin: 'https://evil.example.test' },
      }),
      {
        NODE_ENV: 'production',
        AUTH_PUBLIC_ORIGIN: 'https://portal.example.test',
      },
    ),
    false,
  );
  assert.equal(
    isSameOriginMutation(
      new Request('https://portal.example.test/api/auth/login', {
        method: 'POST',
        headers: { origin: 'https://portal.example.test' },
      }),
      {
        NODE_ENV: 'production',
        AUTH_PUBLIC_ORIGIN: 'https://portal.example.test',
      },
    ),
    true,
  );

  const parsed = await parseIdentityMutation(
    new Request('https://portal.example.test/api/account/security/policy', {
      method: 'POST',
      headers: {
        origin: 'https://portal.example.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ organizationId: 'tenant-b' }),
    }),
  );
  assert.equal(parsed.response?.status, 400);
});

test('identity rate limit is scoped and bounded', async () => {
  const limiter = new MemoryIdentityRateLimiter(() => new Date('2026-07-30T12:00:00.000Z'));
  const request = {
    scope: 'mfa-challenge' as const,
    subject: 'opaque-challenge',
    limit: 2,
    windowSeconds: 60,
  };
  assert.equal(await limiter.consume(request), true);
  assert.equal(await limiter.consume(request), true);
  assert.equal(await limiter.consume(request), false);
  assert.equal(await limiter.consume({ ...request, subject: 'different-challenge' }), true);
});

test('identity email delivery is disabled outside production and fails closed without provider', async () => {
  const previousNodeEnvironment = process.env.NODE_ENV;
  const previousDriver = process.env.IDENTITY_EMAIL_DRIVER;
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousMailFrom = process.env.MAIL_FROM;
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(null, { status: 202 });
  };
  try {
    Object.assign(process.env, { NODE_ENV: 'test' });
    await sendIdentityEmail({
      kind: 'PASSWORD_RESET',
      recipient: 'identity@example.test',
      code: 'test-only-code',
    });
    assert.equal(requests, 0);

    Object.assign(process.env, { NODE_ENV: 'production' });
    delete process.env.IDENTITY_EMAIL_DRIVER;
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
    await assert.rejects(
      () =>
        sendIdentityEmail({
          kind: 'EMAIL_VERIFICATION',
          recipient: 'identity@example.test',
          code: 'test-only-code',
        }),
      /delivery is not configured/u,
    );
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousNodeEnvironment === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Object.assign(process.env, { NODE_ENV: previousNodeEnvironment });
    if (previousDriver === undefined) delete process.env.IDENTITY_EMAIL_DRIVER;
    else process.env.IDENTITY_EMAIL_DRIVER = previousDriver;
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;
    if (previousMailFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = previousMailFrom;
  }
});

test('Prisma identity model scopes credential and external subject uniqueness correctly', async () => {
  const schema = await readFile(
    path.resolve(process.cwd(), '../../packages/database/prisma/schema.prisma'),
    'utf8',
  );
  assert.match(schema, /model UserCredential[\s\S]*identifierNormalized\s+String\s+@unique/u);
  assert.match(schema, /model ExternalIdentity[\s\S]*@@unique\(\[providerId, subject\]\)/u);
  assert.doesNotMatch(schema, /emailNormalized\s+String\s+@unique/u);
  assert.match(schema, /model OrganizationMembership/u);
  assert.match(schema, /model UserSession/u);
  assert.match(schema, /model OrganizationIdentityPolicy/u);
  assert.match(schema, /model IdentityInvitation/u);
  assert.match(schema, /model OidcAuthorizationRequest/u);
  assert.match(schema, /emailVerifiedAt\s+DateTime\?/u);
});

test('identity audit action allowlist includes the required lifecycle without sensitive metadata', async () => {
  const source = await readFile(
    path.resolve(process.cwd(), 'lib/identity-security-events.ts'),
    'utf8',
  );
  for (const action of [
    'identity.login.success',
    'identity.login.failure',
    'identity.logout',
    'identity.password.changed',
    'identity.password.reset_requested',
    'identity.password.reset_completed',
    'identity.mfa.enrollment_started',
    'identity.mfa.enabled',
    'identity.mfa.disabled',
    'identity.mfa.challenge_failed',
    'identity.recovery_code.used',
    'identity.session.revoked',
    'identity.session.revoked_all',
    'identity.external.linked',
    'identity.external.unlinked',
    'identity.provider.created',
    'identity.provider.updated',
    'identity.provider.enabled',
    'identity.provider.disabled',
    'identity.provider.metadata_refreshed',
    'identity.provider.tenant_validated',
    'identity.policy.updated',
    'identity.invitation.created',
    'identity.invitation.accepted',
    'identity.invitation.revoked',
  ]) {
    assert.match(source, new RegExp(action.replaceAll('.', '\\.'), 'u'));
  }
  assert.doesNotMatch(
    source,
    /rawEmail|rawUserAgent|requestBody|providerToken|clientSecret|authorizationCode/u,
  );
});
