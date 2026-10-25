import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AccessRequestError,
  createAccessRequest,
  decideAccessRequest,
  listAccessRequestsForReview,
  verifyAccessRequestEmail,
} from '../lib/access-requests';
import { inviteMemberToCompanyAsPlatformAdmin, TeamInvitationError } from '../lib/team';
import { evaluatePlatformPermission } from '../lib/platform-permissions';

test('access requests require a configured database', async () => {
  await assert.rejects(
    () => createAccessRequest({ name: 'Jane', email: 'jane@example.test', companyName: 'Acme' }),
    (error: unknown) => error instanceof AccessRequestError && error.code === 'DATABASE_UNAVAILABLE',
  );
  await assert.rejects(
    () => decideAccessRequest('platform-admin', 'request-1', { action: 'reject' }),
    (error: unknown) => error instanceof AccessRequestError && error.code === 'DATABASE_UNAVAILABLE',
  );
  assert.deepEqual(await listAccessRequestsForReview(), []);
});

test('verification token is rejected before touching the database when malformed', async () => {
  await assert.rejects(
    () => verifyAccessRequestEmail(''),
    (error: unknown) => error instanceof AccessRequestError && error.code === 'INVALID_TOKEN',
  );
  await assert.rejects(
    () => verifyAccessRequestEmail('x'.repeat(300)),
    (error: unknown) => error instanceof AccessRequestError && error.code === 'INVALID_TOKEN',
  );
});

test('platform-admin invitations reject disallowed roles before touching the database', async () => {
  await assert.rejects(
    () =>
      inviteMemberToCompanyAsPlatformAdmin('platform-admin', {
        companyId: 'some-company',
        email: 'candidate@example.test',
        role: 'OWNER',
      }),
    (error: unknown) => error instanceof TeamInvitationError && error.code === 'INVITATION_FORBIDDEN',
  );
});

test('only platform owner and admin can manage access requests', () => {
  const decide = (role: 'PLATFORM_OWNER' | 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT' | 'PLATFORM_AUDITOR' | 'PLATFORM_OPERATOR') =>
    evaluatePlatformPermission({
      session: {
        userId: 'actor',
        name: 'Actor',
        email: 'actor@example.test',
        company: 'Avantime',
        role: 'ADMIN',
        expiresAt: Date.now() + 60_000,
      },
      assignment: { id: 'assignment-1', userId: 'actor', role, active: true, version: 1 },
      permission: 'platform.access_requests.manage',
    });

  assert.equal(decide('PLATFORM_OWNER').allowed, true);
  assert.equal(decide('PLATFORM_ADMIN').allowed, true);
  assert.equal(decide('PLATFORM_SUPPORT').allowed, false);
  assert.equal(decide('PLATFORM_AUDITOR').allowed, false);
  assert.equal(decide('PLATFORM_OPERATOR').allowed, false);
});

test('an ordinary client without a platform assignment cannot manage access requests', () => {
  const decision = evaluatePlatformPermission({
    session: {
      userId: 'ordinary-client',
      name: 'Ordinary Client',
      email: 'client@example.test',
      company: 'Client Company',
      companyId: 'client-company',
      role: 'CLIENT',
      organizationRole: 'ADMIN',
      expiresAt: Date.now() + 60_000,
    },
    assignment: null,
    permission: 'platform.access_requests.manage',
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, 'ASSIGNMENT_REQUIRED');
});
