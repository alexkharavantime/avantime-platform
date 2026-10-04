import assert from 'node:assert/strict';
import test from 'node:test';

import type { PrismaClient } from '@prisma/client';

import {
  AccessRequestError,
  createAccessRequest,
  decideAccessRequest,
  listAccessRequestsForReview,
  verifyAccessRequestEmail,
} from '../../lib/access-requests';
import { evaluatePlatformPermission } from '../../lib/platform-permissions';
import { acceptCompanyInvitation, TeamInvitationError } from '../../lib/team';
import { createUserSession, resolveSessionToken, type AppSession } from '../../lib/session';
import { integrationDatabase } from './integration-test-environment';

// NOTE: requires an isolated test database with the approved access-request schema already applied.
// Do not create or apply migrations as part of this test. Run only after separate authorization.
test('access request full lifecycle: submit, verify, approve, accept, first login', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const suffix = crypto.randomUUID();
  const companyId = `integration-access-request-${suffix}`;
  const platformAdminId = `integration-access-admin-${suffix}`;
  const email = `candidate.${suffix}@example.test`;

  await prisma.company.create({ data: { id: companyId, name: 'Access Request Tenant' } });
  await prisma.user.create({
    data: {
      id: platformAdminId,
      email: `platform-admin.${suffix}@example.test`,
      emailNormalized: `platform-admin.${suffix}@example.test`,
      name: 'Platform Admin',
      role: 'ADMIN',
      active: true,
      platformRoleAssignments: { create: { role: 'PLATFORM_ADMIN', active: true } },
    },
  });

  const { token } = await createAccessRequest({
    name: 'Candidate Name',
    email,
    companyName: 'Some Company Ltd',
  });

  const verified = await verifyAccessRequestEmail(token);
  const reviewQueue = await listAccessRequestsForReview();
  assert.ok(reviewQueue.some((item) => item.id === verified.id && item.status === 'EMAIL_VERIFIED'));

  const decision = await decideAccessRequest(platformAdminId, verified.id, {
    action: 'approve',
    companyId,
    role: 'MEMBER',
  });
  assert.equal(decision.status, 'APPROVED');
  if (decision.status !== 'APPROVED') return;

  const decided = await prisma.accessRequest.findUniqueOrThrow({ where: { id: verified.id } });
  assert.equal(decided.status, 'APPROVED');
  assert.equal(decided.decisionCompanyId, companyId);
  assert.equal(decided.invitationId, decision.invitation.id);

  // Before acceptance: no membership, no company data access.
  const membershipsBeforeAccept = await prisma.organizationMembership.count({
    where: { user: { emailNormalized: email }, companyId },
  });
  assert.equal(membershipsBeforeAccept, 0);

  const acceptingUserId = `integration-access-user-${suffix}`;
  await prisma.user.create({
    data: {
      id: acceptingUserId,
      email,
      emailNormalized: email,
      emailVerifiedAt: new Date(),
      name: 'Candidate Name',
      role: 'CLIENT',
      active: true,
    },
  });
  const acceptorSession = {
    userId: acceptingUserId,
    email,
    name: 'Candidate Name',
    company: '',
    role: 'CLIENT',
    expiresAt: Date.now() + 60_000,
  } satisfies AppSession;
  const accepted = await acceptCompanyInvitation(acceptorSession, decision.invitation.token);
  assert.equal(accepted.companyId, companyId);

  const created = await createUserSession(
    {
      userId: acceptingUserId,
      email,
      name: 'Candidate Name',
      company: 'Access Request Tenant',
      role: 'CLIENT',
      companyId,
    },
    { userAgent: 'integration-test' },
  );
  const firstLoginSession = await resolveSessionToken(created.token);
  assert.equal(firstLoginSession?.companyId, companyId);
  assert.equal(
    await prisma.organizationMembership.count({
      where: { userId: acceptingUserId, companyId, active: true, status: 'ACTIVE' },
    }),
    1,
  );
});

test('expired verification link is rejected and cannot be reused', async () => {
  const suffix = crypto.randomUUID();
  const email = `expired.${suffix}@example.test`;
  const past = new Date(Date.now() - 60_000);
  const { token } = await createAccessRequest({
    name: 'Expired Candidate',
    email,
    companyName: 'Expired Co',
  }, past);
  await assert.rejects(
    () => verifyAccessRequestEmail(token, new Date()),
    (error: unknown) => error instanceof AccessRequestError && error.code === 'INVALID_TOKEN',
  );
});

test('a verification link can only be used once', async () => {
  const suffix = crypto.randomUUID();
  const email = `reuse.${suffix}@example.test`;
  const { token } = await createAccessRequest({ name: 'Reuse Candidate', email, companyName: 'Reuse Co' });
  await verifyAccessRequestEmail(token);
  await assert.rejects(
    () => verifyAccessRequestEmail(token),
    (error: unknown) => error instanceof AccessRequestError && error.code === 'INVALID_TOKEN',
  );
});

test('concurrent approval of the same request only creates one invitation', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const suffix = crypto.randomUUID();
  const companyId = `integration-concurrent-${suffix}`;
  const platformAdminId = `integration-concurrent-admin-${suffix}`;
  const email = `concurrent.${suffix}@example.test`;
  await prisma.company.create({ data: { id: companyId, name: 'Concurrent Tenant' } });
  await prisma.user.create({
    data: {
      id: platformAdminId,
      email: `concurrent-admin.${suffix}@example.test`,
      emailNormalized: `concurrent-admin.${suffix}@example.test`,
      name: 'Concurrent Admin',
      role: 'ADMIN',
      active: true,
      platformRoleAssignments: { create: { role: 'PLATFORM_ADMIN', active: true } },
    },
  });
  const { token } = await createAccessRequest({ name: 'Concurrent Candidate', email, companyName: 'Co' });
  const { id } = await verifyAccessRequestEmail(token);

  const decide = () =>
    decideAccessRequest(platformAdminId, id, { action: 'approve', companyId, role: 'MEMBER' });
  const results = await Promise.allSettled([decide(), decide()]);
  const succeeded = results.filter((result) => result.status === 'fulfilled');
  assert.equal(succeeded.length, 1);
  assert.equal(
    await prisma.identityInvitation.count({ where: { companyId, emailNormalized: email } }),
    1,
  );
});

test('an approval that fails to create the invitation is rolled back, not stuck as approved', async () => {
  const suffix = crypto.randomUUID();
  const platformAdminId = `integration-rollback-admin-${suffix}`;
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  await prisma.user.create({
    data: {
      id: platformAdminId,
      email: `rollback-admin.${suffix}@example.test`,
      emailNormalized: `rollback-admin.${suffix}@example.test`,
      name: 'Rollback Admin',
      role: 'ADMIN',
      active: true,
      platformRoleAssignments: { create: { role: 'PLATFORM_ADMIN', active: true } },
    },
  });
  const email = `rollback.${suffix}@example.test`;
  const { token } = await createAccessRequest({ name: 'Rollback Candidate', email, companyName: 'Co' });
  const { id } = await verifyAccessRequestEmail(token);

  await assert.rejects(
    () =>
      decideAccessRequest(platformAdminId, id, {
        action: 'approve',
        companyId: 'does-not-exist',
        role: 'MEMBER',
      }),
    (error: unknown) => error instanceof TeamInvitationError && error.code === 'INVITATION_INVALID',
  );
  const rolledBack = await prisma.accessRequest.findUniqueOrThrow({ where: { id } });
  assert.equal(rolledBack.status, 'EMAIL_VERIFIED');
  assert.equal(rolledBack.decidedById, null);

  // The request must still be decidable after the failed attempt.
  const companyId = `integration-rollback-company-${suffix}`;
  await prisma.company.create({ data: { id: companyId, name: 'Rollback Tenant' } });
  const decision = await decideAccessRequest(platformAdminId, id, {
    action: 'approve',
    companyId,
    role: 'MEMBER',
  });
  assert.equal(decision.status, 'APPROVED');
});

test('only an assigned platform admin/owner may decide an access request', () => {
  const decision = evaluatePlatformPermission({
    session: {
      userId: 'actor',
      name: 'Actor',
      email: 'actor@example.test',
      company: 'Avantime',
      role: 'CLIENT',
      expiresAt: Date.now() + 60_000,
    },
    assignment: { id: 'a', userId: 'actor', role: 'PLATFORM_SUPPORT', active: true, version: 1 },
    permission: 'platform.access_requests.manage',
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, 'PERMISSION_DENIED');
});

test('approving into company A never grants membership or access in company B', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const suffix = crypto.randomUUID();
  const companyA = `integration-isolation-a-${suffix}`;
  const companyB = `integration-isolation-b-${suffix}`;
  const platformAdminId = `integration-isolation-admin-${suffix}`;
  const email = `isolation.${suffix}@example.test`;
  await prisma.company.createMany({
    data: [
      { id: companyA, name: 'Isolation Tenant A' },
      { id: companyB, name: 'Isolation Tenant B' },
    ],
  });
  await prisma.user.create({
    data: {
      id: platformAdminId,
      email: `isolation-admin.${suffix}@example.test`,
      emailNormalized: `isolation-admin.${suffix}@example.test`,
      name: 'Isolation Admin',
      role: 'ADMIN',
      active: true,
      platformRoleAssignments: { create: { role: 'PLATFORM_ADMIN', active: true } },
    },
  });
  // The requester wrote "Isolation Tenant B" as free text; the admin must still explicitly choose A.
  const { token } = await createAccessRequest({
    name: 'Isolation Candidate',
    email,
    companyName: 'Isolation Tenant B',
  });
  const { id } = await verifyAccessRequestEmail(token);
  const decision = await decideAccessRequest(platformAdminId, id, {
    action: 'approve',
    companyId: companyA,
    role: 'MEMBER',
  });
  assert.equal(decision.status, 'APPROVED');
  if (decision.status !== 'APPROVED') return;
  assert.equal(
    await prisma.identityInvitation.count({ where: { id: decision.invitation.id, companyId: companyA } }),
    1,
  );
  assert.equal(
    await prisma.identityInvitation.count({ where: { id: decision.invitation.id, companyId: companyB } }),
    0,
  );
});
