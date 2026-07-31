import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import test from 'node:test';

import type { Prisma, PrismaClient } from '@prisma/client';

import { createEmailVerification, verifyEmailToken } from '../../lib/email-verification';
import { authenticateMfaChallenge, authenticatePrimaryCredential } from '../../lib/identity-auth';
import { encryptIdentitySecret } from '../../lib/identity-encryption';
import { beginTotpEnrollment, confirmTotpEnrollment } from '../../lib/identity-management';
import { totpAtCounter } from '../../lib/mfa';
import {
  beginOidcAuthorization,
  consumeOidcAuthorization,
  createDeterministicMockOidcIdp,
} from '../../lib/oidc';
import { completeOidcCallback } from '../../lib/oidc-flow';
import {
  createOidcProvider,
  getOidcProvider,
  OidcProviderConfigurationError,
  refreshOidcProviderMetadata,
  setOidcProviderEnabled,
  updateOidcProvider,
} from '../../lib/oidc-provider-configuration';
import { createPasswordReset, resetPassword } from '../../lib/password-reset';
import { createUserSession, resolveSessionToken, type AppSession } from '../../lib/session';
import { acceptCompanyInvitation, inviteCompanyMember } from '../../lib/team';
import { integrationDatabase } from './integration-test-environment';

const MFA_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';

const recoveryCodeHashSelect = {
  codeHash: true,
} satisfies Prisma.RecoveryCodeSelect;

type StoredRecoveryCodeHash = Prisma.RecoveryCodeGetPayload<{
  select: typeof recoveryCodeHashSelect;
}>;

function legacyPasswordHash(password: string, salt: string) {
  const digest = pbkdf2Sync(password, salt, 210_000, 32, 'sha256').toString('hex');
  return `pbkdf2$210000$${salt}$${digest}`;
}

test('production identity persists opaque sessions, MFA, recovery, and reset lifecycle', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const suffix = crypto.randomUUID();
  const companyId = `integration-identity-${suffix}`;
  const invitedCompanyId = `integration-invited-${suffix}`;
  const inviterId = `integration-inviter-${suffix}`;
  const userId = `integration-identity-user-${suffix}`;
  const email = `identity.${suffix}@example.test`;
  const providerKey = `mock-${suffix}`;
  const password = 'integration identity strong secret';
  const replacementPassword = 'replacement identity strong secret';
  const previousMfaKey = process.env.MFA_ENCRYPTION_KEY;
  const previousMfaKeyVersion = process.env.MFA_ENCRYPTION_KEY_VERSION;
  process.env.MFA_ENCRYPTION_KEY = MFA_KEY;
  process.env.MFA_ENCRYPTION_KEY_VERSION = 'integration-v1';
  try {
    await prisma.company.createMany({
      data: [
        { id: companyId, name: 'Identity Integration Tenant' },
        { id: invitedCompanyId, name: 'Invited Integration Tenant' },
      ],
    });
    await prisma.user.create({
      data: {
        id: inviterId,
        email: `inviter.${suffix}@example.test`,
        emailNormalized: `inviter.${suffix}@example.test`,
        emailVerifiedAt: new Date(),
        name: 'Identity Integration Inviter',
        role: 'CLIENT',
        active: true,
        companyId: invitedCompanyId,
        memberships: {
          create: { companyId: invitedCompanyId, role: 'CLIENT', active: true },
        },
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        email,
        emailNormalized: email,
        name: 'Identity Integration User',
        role: 'CLIENT',
        active: true,
        companyId,
        memberships: {
          create: { companyId, role: 'CLIENT', active: true },
        },
        credentials: {
          create: {
            kind: 'PASSWORD',
            identifierNormalized: email,
            passwordHash: legacyPasswordHash(password, `salt-${suffix}`),
          },
        },
      },
    });

    const primary = await authenticatePrimaryCredential({
      email: email.toUpperCase(),
      password,
    });
    assert.equal(primary.status, 'AUTHENTICATED');
    if (primary.status !== 'AUTHENTICATED') return;
    const upgraded = await prisma.userCredential.findUnique({
      where: { identifierNormalized: email },
      select: { passwordHash: true },
    });
    assert.match(upgraded?.passwordHash ?? '', /^scrypt\$v1\$/u);

    const firstSession = await createUserSession(primary.identity, {
      userAgent: 'Mozilla/5.0 Chrome/120 Linux',
    });
    const current = await resolveSessionToken(firstSession.token);
    assert.equal(current?.userId, userId);
    assert.equal(current?.companyId, companyId);

    const firstVerification = await createEmailVerification(email);
    const secondVerification = await createEmailVerification(email, '/portal/settings/security');
    assert.equal((await verifyEmailToken(firstVerification.token)).status, 'INVALID');
    const verification = await verifyEmailToken(secondVerification.token);
    assert.equal(verification.status, 'VERIFIED');
    assert.equal(
      verification.status === 'VERIFIED' && verification.redirectTo,
      '/portal/settings/security',
    );
    assert.equal((await verifyEmailToken(secondVerification.token)).status, 'INVALID');

    const inviterSession = {
      userId: inviterId,
      email: `inviter.${suffix}@example.test`,
      name: 'Identity Integration Inviter',
      role: 'CLIENT',
      companyId: invitedCompanyId,
      company: 'Invited Integration Tenant',
      expiresAt: Date.now() + 60_000,
    } satisfies AppSession;
    const invitation = await inviteCompanyMember(inviterSession, {
      name: 'Ignored profile input',
      email,
      jobTitle: 'Ignored profile input',
    });
    assert.equal(
      await prisma.organizationMembership.count({
        where: { userId, companyId: invitedCompanyId },
      }),
      0,
    );
    const accepted = await acceptCompanyInvitation(current as AppSession, invitation.token);
    assert.equal(accepted.companyId, invitedCompanyId);
    assert.equal(
      await prisma.organizationMembership.count({
        where: { userId, companyId: invitedCompanyId, role: 'CLIENT', active: true },
      }),
      1,
    );
    await assert.rejects(
      () => acceptCompanyInvitation(current as AppSession, invitation.token),
      /Team invitation operation failed/u,
    );

    const provider = await prisma.identityProvider.create({
      data: {
        key: providerKey,
        kind: 'OIDC',
        oidcProfile: 'GENERIC_OIDC',
        displayName: 'Integration Mock OIDC',
        companyId,
        issuer: 'https://mock-idp.example.test',
        clientId: 'integration-client',
        clientSecretRefEncrypted: encryptIdentitySecret(
          'env:OIDC_INTEGRATION_CLIENT_SECRET',
          'oidc-client-secret-ref',
        ),
        secretKeyVersion: 'integration-v1',
        discoveryUrl: 'https://mock-idp.example.test/.well-known/openid-configuration',
        authorizationEndpoint: 'https://mock-idp.example.test/authorize',
        tokenEndpoint: 'https://mock-idp.example.test/token',
        jwksUri: 'https://mock-idp.example.test/jwks',
        redirectUri: 'https://portal.example.test/api/auth/oidc/callback',
        redirectUris: ['https://portal.example.test/api/auth/oidc/callback'],
        validationStatus: 'TENANT_VALIDATED',
        validationEvidenceRef: 'integration:deterministic-mock',
        metadataRefreshedAt: new Date(),
        metadataExpiresAt: new Date(Date.now() + 60_000),
        enabled: true,
      },
    });
    await prisma.organizationIdentityPolicy.create({
      data: {
        companyId,
        ssoRequirement: 'OPTIONAL',
        ssoProviderId: provider.id,
      },
    });
    const oidc = await beginOidcAuthorization({
      providerKey,
      redirectUri: 'https://portal.example.test/api/auth/oidc/callback',
      userId,
      companyId,
      purpose: 'LINK',
    });
    const consumedOidc = await consumeOidcAuthorization({
      providerKey,
      state: oidc.state,
      redirectUri: 'https://portal.example.test/api/auth/oidc/callback',
    });
    assert.equal(consumedOidc.userId, userId);
    assert.ok(consumedOidc.codeVerifier.length >= 43);
    await assert.rejects(
      () =>
        consumeOidcAuthorization({
          providerKey,
          state: oidc.state,
          redirectUri: 'https://portal.example.test/api/auth/oidc/callback',
        }),
      /OIDC validation failed/u,
    );

    await prisma.externalIdentity.create({
      data: {
        userId,
        providerId: provider.id,
        subject: 'integration-subject',
        emailNormalized: email,
        emailVerified: true,
      },
    });
    const callbackNow = new Date();
    const mockIdp = createDeterministicMockOidcIdp({
      issuer: 'https://mock-idp.example.test',
      clientId: 'integration-client',
      now: callbackNow,
    });
    const loginOidc = await beginOidcAuthorization({
      providerKey,
      redirectUri: 'https://portal.example.test/api/auth/oidc/callback',
      returnTo: '/portal/documents',
      now: callbackNow,
    });
    const callback = await completeOidcCallback({
      state: loginOidc.state,
      code: 'integration-authorization-code',
      redirectUri: 'https://portal.example.test/api/auth/oidc/callback',
      correlationId: `identity-integration-${suffix}`,
      now: callbackNow,
      secretResolver: async (reference) => {
        assert.equal(reference, 'env:OIDC_INTEGRATION_CLIENT_SECRET');
        return 'integration-client-secret';
      },
      fetcher: async (url, init) => {
        if (String(url).endsWith('/token')) {
          const form = new URLSearchParams(String(init?.body));
          assert.equal(form.get('code'), 'integration-authorization-code');
          assert.ok((form.get('code_verifier')?.length ?? 0) >= 43);
          return Response.json({
            id_token: mockIdp.issueToken({
              subject: 'integration-subject',
              email,
              nonce: loginOidc.nonce,
            }),
          });
        }
        if (String(url).endsWith('/jwks')) return Response.json(mockIdp.jwks);
        return new Response(null, { status: 404 });
      },
    });
    assert.equal(callback.status, 'AUTHENTICATED');
    assert.equal(callback.providerId, provider.id);
    assert.equal(callback.returnTo, '/portal/documents');
    assert.equal(
      callback.status === 'AUTHENTICATED' && callback.identity.identityProviderId,
      provider.id,
    );

    const enrollmentTime = new Date('2026-07-30T12:00:00.000Z');
    const enrollment = await beginTotpEnrollment(current as AppSession, enrollmentTime);
    const enrollmentCounter = Math.floor(enrollmentTime.getTime() / 1000 / 30);
    const recoveryCodes = await confirmTotpEnrollment(
      current as AppSession,
      enrollment.methodId,
      totpAtCounter(enrollment.secret, enrollmentCounter),
      enrollmentTime,
    );
    assert.equal(recoveryCodes.length, 10);
    const storedRecovery: StoredRecoveryCodeHash[] = await prisma.recoveryCode.findMany({
      where: { userId },
      select: recoveryCodeHashSelect,
    });
    assert.equal(storedRecovery.length, 10);
    assert.equal(
      storedRecovery.some((item) => recoveryCodes.includes(item.codeHash)),
      false,
    );

    const mfaTime = new Date(enrollmentTime.getTime() + 30_000);
    const withMfa = await authenticatePrimaryCredential({
      email,
      password,
      now: mfaTime,
      redirectTo: 'https://evil.example.test',
    });
    assert.equal(withMfa.status, 'MFA_REQUIRED');
    if (withMfa.status !== 'MFA_REQUIRED') return;
    const mfa = await authenticateMfaChallenge({
      challengeToken: withMfa.challengeToken,
      code: totpAtCounter(enrollment.secret, enrollmentCounter + 1),
      now: mfaTime,
      environment: {
        MFA_ENCRYPTION_KEY: MFA_KEY,
        MFA_ENCRYPTION_KEY_VERSION: 'integration-v1',
      },
    });
    assert.equal(mfa.status, 'AUTHENTICATED');
    if (mfa.status !== 'AUTHENTICATED') return;
    assert.equal(mfa.returnTo, undefined);

    const recoveryPrimary = await authenticatePrimaryCredential({
      email,
      password,
      now: new Date(mfaTime.getTime() + 30_000),
    });
    assert.equal(recoveryPrimary.status, 'MFA_REQUIRED');
    if (recoveryPrimary.status !== 'MFA_REQUIRED') return;
    const recovered = await authenticateMfaChallenge({
      challengeToken: recoveryPrimary.challengeToken,
      code: recoveryCodes[0],
      now: new Date(mfaTime.getTime() + 30_000),
      environment: {
        MFA_ENCRYPTION_KEY: MFA_KEY,
        MFA_ENCRYPTION_KEY_VERSION: 'integration-v1',
      },
    });
    assert.equal(recovered.status, 'AUTHENTICATED');
    assert.equal(recovered.status === 'AUTHENTICATED' && recovered.recoveryCodeUsed, true);

    const invalidatedResetToken = await createPasswordReset(email);
    const resetToken = await createPasswordReset(email);
    assert.equal(
      (await resetPassword(invalidatedResetToken.token, replacementPassword)).status,
      'INVALID',
    );
    const reset = await resetPassword(resetToken.token, replacementPassword);
    assert.equal(reset.status, 'SUCCEEDED');
    assert.equal(await resolveSessionToken(firstSession.token), null);
    assert.equal((await resetPassword(resetToken.token, replacementPassword)).status, 'INVALID');
    assert.equal(
      (
        await authenticatePrimaryCredential({
          email,
          password: replacementPassword,
        })
      ).status,
      'MFA_REQUIRED',
    );
  } finally {
    if (previousMfaKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = previousMfaKey;
    if (previousMfaKeyVersion === undefined) delete process.env.MFA_ENCRYPTION_KEY_VERSION;
    else process.env.MFA_ENCRYPTION_KEY_VERSION = previousMfaKeyVersion;
    await prisma.identityInvitation.deleteMany({
      where: { companyId: { in: [companyId, invitedCompanyId] } },
    });
    await prisma.organizationIdentityPolicy.deleteMany({ where: { companyId } });
    await prisma.externalIdentity.deleteMany({
      where: { provider: { key: providerKey } },
    });
    await prisma.identityProvider.deleteMany({ where: { key: providerKey } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, inviterId] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, invitedCompanyId] } } });
  }
});

test('OIDC provider lifecycle is ADMIN-only, tenant-bound, versioned, and fail-closed', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const suffix = crypto.randomUUID();
  const companyA = `oidc-company-a-${suffix}`;
  const companyB = `oidc-company-b-${suffix}`;
  const adminA = `oidc-admin-a-${suffix}`;
  const adminB = `oidc-admin-b-${suffix}`;
  const providerKey = `enterprise-${suffix}`;
  const previousMfaKey = process.env.MFA_ENCRYPTION_KEY;
  const previousMfaKeyVersion = process.env.MFA_ENCRYPTION_KEY_VERSION;
  const previousOrigin = process.env.AUTH_PUBLIC_ORIGIN;
  process.env.MFA_ENCRYPTION_KEY = MFA_KEY;
  process.env.MFA_ENCRYPTION_KEY_VERSION = 'integration-v1';
  process.env.AUTH_PUBLIC_ORIGIN = 'https://portal.example.test';
  const session = (userId: string, companyId: string) =>
    ({
      userId,
      email: `${userId}@example.test`,
      name: 'OIDC Administrator',
      role: 'ADMIN',
      companyId,
      company: 'OIDC Integration Tenant',
      expiresAt: Date.now() + 60_000,
      authenticationAt: Date.now(),
      mfaSatisfied: true,
    }) satisfies AppSession;
  const configuration = {
    key: providerKey,
    profile: 'MICROSOFT_ENTRA_ID' as const,
    displayName: 'Enterprise Entra',
    issuer: `https://login.microsoftonline.com/${companyA}/v2.0`,
    discoveryUrl: `https://login.microsoftonline.com/${companyA}/v2.0/.well-known/openid-configuration`,
    clientId: `client-${suffix}`,
    clientSecretReference: 'env:OIDC_INTEGRATION_CLIENT_SECRET',
    redirectUris: ['https://portal.example.test/api/auth/oidc/callback'],
    allowedEmailDomains: ['example.test'],
    organizationMappingMode: 'PROVIDER_TENANT_CLAIM' as const,
    tenantMappingPolicy: { allowedTenantIds: [companyA] },
    claimMapping: {},
    groupMapping: {},
    defaultRole: 'CLIENT' as const,
    sessionPolicy: 'REVOKE_ON_DISABLE' as const,
  };
  try {
    await prisma.company.createMany({
      data: [
        { id: companyA, name: 'OIDC Tenant A' },
        { id: companyB, name: 'OIDC Tenant B' },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: adminA,
          email: `${adminA}@example.test`,
          emailNormalized: `${adminA}@example.test`,
          name: 'OIDC Admin A',
          role: 'ADMIN',
          active: true,
          companyId: companyA,
        },
        {
          id: adminB,
          email: `${adminB}@example.test`,
          emailNormalized: `${adminB}@example.test`,
          name: 'OIDC Admin B',
          role: 'ADMIN',
          active: true,
          companyId: companyB,
        },
      ],
    });
    const created = await createOidcProvider({
      session: session(adminA, companyA),
      configuration,
      correlationId: `oidc-create-${suffix}`,
    });
    assert.equal(created.validationStatus, 'NOT_VALIDATED');
    assert.equal(created.enabled, false);
    assert.equal(created.hasClientSecretReference, true);
    assert.equal('clientSecretReference' in created, false);
    assert.equal(JSON.stringify(created).includes('OIDC_INTEGRATION_CLIENT_SECRET'), false);

    await assert.rejects(
      () => getOidcProvider(session(adminB, companyB), created.id),
      (error: unknown) =>
        error instanceof OidcProviderConfigurationError && error.code === 'PROVIDER_NOT_FOUND',
    );
    await assert.rejects(
      () =>
        setOidcProviderEnabled({
          session: session(adminA, companyA),
          providerId: created.id,
          enabled: true,
          expectedVersion: created.configurationVersion,
          correlationId: `oidc-enable-${suffix}`,
        }),
      (error: unknown) =>
        error instanceof OidcProviderConfigurationError &&
        error.code === 'PROVIDER_VALIDATION_REQUIRED',
    );
    await assert.rejects(
      () =>
        updateOidcProvider({
          session: session(adminA, companyA),
          providerId: created.id,
          expectedVersion: created.configurationVersion,
          configuration: {
            ...configuration,
            issuer: `https://login.microsoftonline.com/${companyB}/v2.0`,
          },
          controlledIssuerRevalidation: false,
          correlationId: `oidc-update-rejected-${suffix}`,
        }),
      (error: unknown) =>
        error instanceof OidcProviderConfigurationError &&
        error.code === 'ISSUER_REVALIDATION_REQUIRED',
    );
    const validationNow = new Date();
    const metadataValidated = await refreshOidcProviderMetadata({
      session: session(adminA, companyA),
      providerId: created.id,
      expectedVersion: created.configurationVersion,
      correlationId: `oidc-metadata-${suffix}`,
      now: validationNow,
      fetcher: async () =>
        Response.json({
          issuer: configuration.issuer,
          authorization_endpoint: `${configuration.issuer}/authorize`,
          token_endpoint: `${configuration.issuer}/token`,
          jwks_uri: `${configuration.issuer}/jwks`,
        }),
    });
    assert.equal(metadataValidated.validationStatus, 'METADATA_VALIDATED');
    const validationIdp = createDeterministicMockOidcIdp({
      issuer: configuration.issuer,
      clientId: configuration.clientId,
      now: validationNow,
    });
    const validationRequest = await beginOidcAuthorization({
      providerKey,
      redirectUri: configuration.redirectUris[0],
      userId: adminA,
      companyId: companyA,
      purpose: 'PROVIDER_VALIDATION',
      now: validationNow,
    });
    const validation = await completeOidcCallback({
      state: validationRequest.state,
      code: 'provider-validation-code',
      redirectUri: configuration.redirectUris[0],
      currentSession: session(adminA, companyA),
      correlationId: `oidc-validation-${suffix}`,
      now: validationNow,
      secretResolver: async () => 'integration-client-secret',
      fetcher: async (url) =>
        String(url).endsWith('/token')
          ? Response.json({
              id_token: validationIdp.issueToken({
                subject: `admin-subject-${suffix}`,
                email: `${adminA}@example.test`,
                nonce: validationRequest.nonce,
                tenantId: companyA,
              }),
            })
          : Response.json(validationIdp.jwks),
    });
    assert.equal(validation.status, 'PROVIDER_VALIDATED');
    const tenantValidated = await getOidcProvider(session(adminA, companyA), created.id);
    assert.equal(tenantValidated.validationStatus, 'TENANT_VALIDATED');
    assert.match(tenantValidated.validationEvidenceRef ?? '', /^oidc-validation:/u);
    const enabled = await setOidcProviderEnabled({
      session: session(adminA, companyA),
      providerId: created.id,
      enabled: true,
      expectedVersion: tenantValidated.configurationVersion,
      correlationId: `oidc-enabled-${suffix}`,
      secretResolver: async () => 'integration-client-secret',
    });
    assert.equal(enabled.enabled, true);
    const changed = await updateOidcProvider({
      session: session(adminA, companyA),
      providerId: created.id,
      expectedVersion: enabled.configurationVersion,
      configuration: {
        ...configuration,
        issuer: `https://login.microsoftonline.com/${companyB}/v2.0`,
      },
      controlledIssuerRevalidation: true,
      correlationId: `oidc-update-${suffix}`,
    });
    assert.equal(changed.validationStatus, 'REVALIDATION_REQUIRED');
    assert.equal(changed.enabled, false);
    assert.equal(changed.configurationVersion, enabled.configurationVersion + 1);
  } finally {
    if (previousMfaKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = previousMfaKey;
    if (previousMfaKeyVersion === undefined) delete process.env.MFA_ENCRYPTION_KEY_VERSION;
    else process.env.MFA_ENCRYPTION_KEY_VERSION = previousMfaKeyVersion;
    if (previousOrigin === undefined) delete process.env.AUTH_PUBLIC_ORIGIN;
    else process.env.AUTH_PUBLIC_ORIGIN = previousOrigin;
    await prisma.identityProvider.deleteMany({ where: { key: providerKey } });
    await prisma.securityEvent.deleteMany({
      where: { companyId: { in: [companyA, companyB] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [adminA, adminB] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
  }
});
