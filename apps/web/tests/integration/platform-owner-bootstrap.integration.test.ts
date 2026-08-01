import assert from 'node:assert/strict';
import test from 'node:test';

import type { PrismaClient } from '@prisma/client';

import {
  dryRunPlatformOwnerBootstrap,
  executePlatformOwnerBootstrap,
  hashBootstrapAuthorization,
  PlatformOwnerBootstrapError,
  type PlatformOwnerBootstrapInput,
} from '../../lib/platform-owner-bootstrap';
import { validateGovernanceInvariants } from '../../lib/governance-invariants';
import { integrationDatabase } from './integration-test-environment';

test('first PLATFORM_OWNER bootstrap is atomic, single-use and concurrency-safe', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const now = new Date();
  const userId = 'integration-platform-owner-bootstrap';
  const sessionId = 'integration-platform-owner-bootstrap-session';
  const mfaEventId = 'integration-platform-owner-bootstrap-mfa-event';
  const token = 'integration-platform-owner-bootstrap-token-with-entropy';
  await prisma.user.create({
    data: {
      id: userId,
      email: 'platform.owner.bootstrap@example.test',
      emailNormalized: 'platform.owner.bootstrap@example.test',
      emailVerifiedAt: now,
      name: 'Platform owner bootstrap fixture',
      role: 'CLIENT',
      active: true,
    },
  });
  await prisma.mfaMethod.create({
    data: {
      id: 'integration-platform-owner-bootstrap-mfa',
      userId,
      kind: 'TOTP',
      status: 'ACTIVE',
      confirmedAt: now,
    },
  });
  await prisma.userSession.create({
    data: {
      id: sessionId,
      tokenHash: 'a'.repeat(64),
      userId,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
      idleExpiresAt: new Date(now.getTime() + 30 * 60_000),
      authenticationAt: now,
    },
  });
  await prisma.securityEvent.create({
    data: {
      id: mfaEventId,
      userId,
      action: 'identity.login.success',
      result: 'SUCCEEDED',
      correlationId: 'integration-platform-owner-bootstrap-login',
      safeMetadata: { method: 'TOTP', sessionId },
      createdAt: now,
    },
  });

  const input = (authorizationId: string): PlatformOwnerBootstrapInput => ({
    environment: 'integration',
    expectedEnvironment: 'integration',
    targetUserId: userId,
    targetEmail: 'platform.owner.bootstrap@example.test',
    sessionEvidenceId: sessionId,
    mfaEventEvidenceId: mfaEventId,
    authorizationId,
    authorizationExpiresAt: new Date(now.getTime() + 5 * 60_000),
    authorizationToken: token,
    expectedAuthorizationHash: hashBootstrapAuthorization(token),
    confirmation: 'BOOTSTRAP FIRST PLATFORM OWNER',
    now: new Date(now.getTime() + 1_000),
  });

  const dryRun = await dryRunPlatformOwnerBootstrap(input('task-013-bootstrap-dry-run'));
  assert.equal(dryRun.mode, 'dry-run');
  assert.equal(await prisma.platformRoleAssignment.count(), 0);
  assert.equal(await prisma.platformOwnerBootstrap.count(), 0);

  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION fail_task_013_bootstrap_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW."action" = 'platform.owner.bootstrap.executed' THEN
        RAISE EXCEPTION 'test audit failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER task_013_bootstrap_audit_failure
    BEFORE INSERT ON "ProductionAuditEvent"
    FOR EACH ROW EXECUTE FUNCTION fail_task_013_bootstrap_audit();
  `);
  await assert.rejects(() =>
    executePlatformOwnerBootstrap(input('task-013-bootstrap-audit-rollback')),
  );
  assert.equal(await prisma.platformRoleAssignment.count(), 0);
  assert.equal(await prisma.platformOwnerBootstrap.count(), 0);
  assert.equal(
    (await prisma.userSession.findUniqueOrThrow({ where: { id: sessionId } })).revokedAt,
    null,
  );
  await prisma.$executeRawUnsafe(
    'DROP TRIGGER task_013_bootstrap_audit_failure ON "ProductionAuditEvent"',
  );
  await prisma.$executeRawUnsafe('DROP FUNCTION fail_task_013_bootstrap_audit()');

  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION fail_task_013_bootstrap_notification() RETURNS trigger AS $$
    BEGIN
      IF NEW."title" = 'Первый PLATFORM_OWNER назначен' THEN
        RAISE EXCEPTION 'test notification failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER task_013_bootstrap_notification_failure
    BEFORE INSERT ON "GovernanceNotification"
    FOR EACH ROW EXECUTE FUNCTION fail_task_013_bootstrap_notification();
  `);
  await assert.rejects(() =>
    executePlatformOwnerBootstrap(input('task-013-bootstrap-notification-rollback')),
  );
  assert.equal(await prisma.platformRoleAssignment.count(), 0);
  assert.equal(
    await prisma.productionAuditEvent.count({
      where: { action: 'platform.owner.bootstrap.executed' },
    }),
    0,
  );
  await prisma.$executeRawUnsafe(
    'DROP TRIGGER task_013_bootstrap_notification_failure ON "GovernanceNotification"',
  );
  await prisma.$executeRawUnsafe('DROP FUNCTION fail_task_013_bootstrap_notification()');

  const concurrent = await Promise.allSettled([
    executePlatformOwnerBootstrap(input('task-013-bootstrap-execute')),
    executePlatformOwnerBootstrap(input('task-013-bootstrap-execute')),
  ]);
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(
    await prisma.platformRoleAssignment.count({ where: { role: 'PLATFORM_OWNER', active: true } }),
    1,
  );
  assert.equal(await prisma.platformOwnerBootstrap.count(), 1);
  assert.equal(
    await prisma.productionAuditEvent.count({
      where: { action: 'platform.owner.bootstrap.executed' },
    }),
    1,
  );
  assert.equal(await prisma.governanceNotification.count({ where: { category: 'SECURITY' } }), 1);
  assert.ok((await prisma.userSession.findUniqueOrThrow({ where: { id: sessionId } })).revokedAt);
  const invariantResult = await validateGovernanceInvariants(new Date(now.getTime() + 2_000));
  assert.equal(invariantResult.status, 'passed');
  assert.equal(
    invariantResult.invariants.every((invariant) => invariant.passed),
    true,
  );
  await assert.rejects(
    () => executePlatformOwnerBootstrap(input('task-013-bootstrap-second-attempt')),
    (error: unknown) =>
      error instanceof PlatformOwnerBootstrapError && error.code === 'BOOTSTRAP_ALREADY_COMPLETED',
  );
});
