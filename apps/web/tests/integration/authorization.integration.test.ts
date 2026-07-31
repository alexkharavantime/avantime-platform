import assert from 'node:assert/strict';
import test from 'node:test';

import type { PrismaClient } from '@prisma/client';

import { authenticateExternalIdentity } from '../../lib/identity-auth';
import { evaluateOrganizationPermission } from '../../lib/organization-permissions';
import {
  createUserSession,
  resolveSessionToken,
  type AppSession,
  type OrganizationRole,
} from '../../lib/session';
import {
  bootstrapFirstOrganizationOwner,
  changeOrganizationMemberRole,
  changeOrganizationMembershipStatus,
  TeamGovernanceError,
} from '../../lib/team';
import { integrationDatabase } from './integration-test-environment';

function organizationSession(input: {
  userId: string;
  companyId: string;
  role: OrganizationRole;
  membershipVersion?: number;
  platformRole?: 'CLIENT' | 'ADMIN';
}): AppSession {
  return {
    userId: input.userId,
    name: `Integration ${input.role}`,
    email: `${input.userId}@example.test`,
    company: 'Authorization Integration Tenant',
    companyId: input.companyId,
    role:
      input.platformRole ?? (input.role === 'ADMIN' || input.role === 'OWNER' ? 'ADMIN' : 'CLIENT'),
    organizationRole: input.role,
    membershipStatus: 'ACTIVE',
    membershipVersion: input.membershipVersion ?? 1,
    mfaSatisfied: true,
    authenticationAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };
}

test('organization governance persists delegation, lifecycle, session revocation, and tenant isolation', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const suffix = crypto.randomUUID();
  const companyId = `integration-permissions-${suffix}`;
  const foreignCompanyId = `integration-permissions-foreign-${suffix}`;
  const ids = {
    owner: `owner-${suffix}`,
    admin: `admin-${suffix}`,
    manager: `manager-${suffix}`,
    member: `member-${suffix}`,
    viewer: `viewer-${suffix}`,
    removed: `removed-${suffix}`,
  };
  await prisma.company.createMany({
    data: [
      { id: companyId, name: 'Authorization Integration Tenant' },
      { id: foreignCompanyId, name: 'Foreign Authorization Tenant' },
    ],
  });
  for (const [roleName, userId] of Object.entries(ids)) {
    const organizationRole =
      roleName === 'removed' ? 'MEMBER' : (roleName.toUpperCase() as OrganizationRole);
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        emailNormalized: `${userId}@example.test`,
        emailVerifiedAt: new Date(),
        name: `Integration ${roleName}`,
        role: organizationRole === 'OWNER' || organizationRole === 'ADMIN' ? 'ADMIN' : 'CLIENT',
        active: true,
        companyId,
        memberships: {
          create: {
            companyId,
            role: organizationRole === 'OWNER' || organizationRole === 'ADMIN' ? 'ADMIN' : 'CLIENT',
            organizationRole,
            status: 'ACTIVE',
            active: true,
          },
        },
      },
    });
  }
  const memberships = await prisma.organizationMembership.findMany({ where: { companyId } });
  const byUser = new Map(memberships.map((membership) => [membership.userId, membership]));
  const owner = organizationSession({ userId: ids.owner, companyId, role: 'OWNER' });
  const admin = organizationSession({ userId: ids.admin, companyId, role: 'ADMIN' });
  const manager = organizationSession({ userId: ids.manager, companyId, role: 'MANAGER' });
  const member = organizationSession({ userId: ids.member, companyId, role: 'MEMBER' });
  const viewer = organizationSession({ userId: ids.viewer, companyId, role: 'VIEWER' });

  const memberSession = await createUserSession(member);
  const promoted = await changeOrganizationMemberRole({
    session: owner,
    membershipId: byUser.get(ids.member)!.id,
    nextRole: 'MANAGER',
    expectedVersion: 1,
    correlationId: `integration-role-${suffix}`,
  });
  assert.equal(promoted.organizationRole, 'MANAGER');
  assert.equal(promoted.version, 2);
  assert.equal(await resolveSessionToken(memberSession.token), null);
  assert.equal(
    evaluateOrganizationPermission(
      {
        ...member,
        organizationRole: promoted.organizationRole,
        membershipVersion: promoted.version,
      },
      'documents.reprocess',
    ).allowed,
    true,
  );

  await assert.rejects(
    () =>
      changeOrganizationMemberRole({
        session: manager,
        membershipId: byUser.get(ids.viewer)!.id,
        nextRole: 'ADMIN',
        expectedVersion: 1,
        correlationId: `integration-manager-denied-${suffix}`,
      }),
    (error: unknown) =>
      error instanceof TeamGovernanceError && error.code === 'ROLE_ASSIGNMENT_DENIED',
  );

  const adminAssigned = await changeOrganizationMemberRole({
    session: admin,
    membershipId: byUser.get(ids.removed)!.id,
    nextRole: 'VIEWER',
    expectedVersion: 1,
    correlationId: `integration-admin-role-${suffix}`,
  });
  assert.equal(adminAssigned.organizationRole, 'VIEWER');
  const managerAssigned = await changeOrganizationMemberRole({
    session: manager,
    membershipId: byUser.get(ids.removed)!.id,
    nextRole: 'MEMBER',
    expectedVersion: 2,
    correlationId: `integration-manager-role-${suffix}`,
  });
  assert.equal(managerAssigned.organizationRole, 'MEMBER');
  await assert.rejects(
    () =>
      changeOrganizationMemberRole({
        session: admin,
        membershipId: byUser.get(ids.viewer)!.id,
        nextRole: 'OWNER',
        expectedVersion: 1,
        confirmation: 'ASSIGN OWNER',
        correlationId: `integration-admin-owner-denied-${suffix}`,
      }),
    (error: unknown) =>
      error instanceof TeamGovernanceError && error.code === 'ROLE_ASSIGNMENT_DENIED',
  );

  const viewerSession = await createUserSession(viewer);
  assert.equal((await resolveSessionToken(viewerSession.token))?.userId, ids.viewer);
  const suspended = await changeOrganizationMembershipStatus({
    session: owner,
    membershipId: byUser.get(ids.viewer)!.id,
    status: 'SUSPENDED',
    expectedVersion: 1,
    correlationId: `integration-suspend-${suffix}`,
  });
  assert.equal(suspended.status, 'SUSPENDED');
  assert.equal(await resolveSessionToken(viewerSession.token), null);

  const provider = await prisma.identityProvider.create({
    data: {
      key: `removed-provider-${suffix}`,
      kind: 'OIDC',
      oidcProfile: 'GENERIC_OIDC',
      displayName: 'Removed membership provider',
      companyId,
      issuer: 'https://removed.example.test',
      clientId: 'removed-client',
      enabled: true,
      validationStatus: 'TENANT_VALIDATED',
    },
  });
  await prisma.externalIdentity.create({
    data: { userId: ids.removed, providerId: provider.id, subject: `removed-${suffix}` },
  });
  const removedMembership = byUser.get(ids.removed)!;
  await changeOrganizationMembershipStatus({
    session: owner,
    membershipId: removedMembership.id,
    status: 'REMOVED',
    expectedVersion: 3,
    correlationId: `integration-remove-${suffix}`,
  });
  assert.equal(
    (
      await authenticateExternalIdentity({
        providerId: provider.id,
        subject: `removed-${suffix}`,
      })
    ).status,
    'INVALID',
  );
  assert.equal(evaluateOrganizationPermission(member, 'requests.create').allowed, true);
  assert.equal(evaluateOrganizationPermission(member, 'identity.policy.manage').allowed, false);
  assert.equal(evaluateOrganizationPermission(viewer, 'documents.view').allowed, true);
  assert.equal(evaluateOrganizationPermission(viewer, 'documents.upload').allowed, false);

  assert.equal(
    evaluateOrganizationPermission(member, 'requests.view', {
      companyId: foreignCompanyId,
      targetType: 'request',
      targetId: `foreign-request-${suffix}`,
    }).reasonCode,
    'RESOURCE_TENANT_MISMATCH',
  );
  assert.equal(evaluateOrganizationPermission(member, 'documents.reprocess').allowed, false);
  assert.equal(evaluateOrganizationPermission(manager, 'identity.providers.manage').allowed, false);
  assert.equal(evaluateOrganizationPermission(member, 'identity.audit.view').allowed, false);
});

test('first OWNER bootstrap is explicit, MFA/recent-auth protected, and one-time', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const suffix = crypto.randomUUID();
  const companyId = `integration-owner-bootstrap-${suffix}`;
  const userId = `integration-owner-admin-${suffix}`;
  await prisma.company.create({ data: { id: companyId, name: 'Owner Bootstrap Tenant' } });
  const user = await prisma.user.create({
    data: {
      id: userId,
      email: `${userId}@example.test`,
      emailNormalized: `${userId}@example.test`,
      name: 'Legacy Administrator',
      role: 'ADMIN',
      companyId,
      memberships: {
        create: { companyId, role: 'ADMIN', organizationRole: 'ADMIN', status: 'ACTIVE' },
      },
    },
    include: { memberships: true },
  });
  const membership = user.memberships[0]!;
  const session = organizationSession({
    userId,
    companyId,
    role: 'ADMIN',
    platformRole: 'ADMIN',
  });
  await assert.rejects(() =>
    bootstrapFirstOrganizationOwner({
      session: { ...session, mfaSatisfied: false },
      membershipId: membership.id,
      expectedVersion: membership.version,
      confirmation: 'ASSIGN OWNER',
      correlationId: `integration-bootstrap-mfa-${suffix}`,
    }),
  );
  const result = await bootstrapFirstOrganizationOwner({
    session,
    membershipId: membership.id,
    expectedVersion: membership.version,
    confirmation: 'ASSIGN OWNER',
    correlationId: `integration-bootstrap-${suffix}`,
  });
  assert.equal(result.version, membership.version + 1);
  assert.equal(
    (await prisma.organizationMembership.findUniqueOrThrow({ where: { id: membership.id } }))
      .organizationRole,
    'OWNER',
  );
  await assert.rejects(() =>
    bootstrapFirstOrganizationOwner({
      session: { ...session, organizationRole: 'OWNER', membershipVersion: result.version },
      membershipId: membership.id,
      expectedVersion: result.version,
      confirmation: 'ASSIGN OWNER',
      correlationId: `integration-bootstrap-replay-${suffix}`,
    }),
  );
});
