import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import test from 'node:test';

import type { Prisma, PrismaClient } from '@prisma/client';

import { createEmailVerification, verifyEmailToken } from '../../lib/email-verification';
import { authenticateMfaChallenge, authenticatePrimaryCredential } from '../../lib/identity-auth';
import { beginTotpEnrollment, confirmTotpEnrollment } from '../../lib/identity-management';
import { totpAtCounter } from '../../lib/mfa';
import { beginOidcAuthorization, consumeOidcAuthorization } from '../../lib/oidc';
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

    await prisma.identityProvider.create({
      data: {
        key: providerKey,
        kind: 'OIDC',
        oidcProfile: 'GENERIC_OIDC',
        displayName: 'Integration Mock OIDC',
        issuer: 'https://mock-idp.example.test',
        clientId: 'integration-client',
        authorizationEndpoint: 'https://mock-idp.example.test/authorize',
        tokenEndpoint: 'https://mock-idp.example.test/token',
        jwksUri: 'https://mock-idp.example.test/jwks',
        redirectUri: 'https://portal.example.test/api/auth/oidc/callback',
        enabled: true,
      },
    });
    const oidc = await beginOidcAuthorization({
      providerKey,
      redirectUri: 'https://portal.example.test/api/auth/oidc/callback',
      userId,
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
    await prisma.identityProvider.deleteMany({ where: { key: providerKey } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, inviterId] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, invitedCompanyId] } } });
  }
});
