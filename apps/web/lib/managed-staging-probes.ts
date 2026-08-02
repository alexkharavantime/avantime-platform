import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { getPrisma } from '@avantime/database';

import { validateGovernanceInvariants } from './governance-invariants';
import type {
  ManagedPreflightProbeName,
  ManagedPreflightProbe,
} from './managed-staging-validation';
import { createRedisCommandClient } from './redis-lease-queue';

function required(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`missing-${name.toLowerCase().replaceAll('_', '-')}`);
  return value;
}

function safeUrl(value: string, name: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${name}-https-required`);
  return url;
}

export function createManagedStagingProbes(input: {
  environment?: NodeJS.ProcessEnv;
  expectedMigrationVersion: string;
}): Record<ManagedPreflightProbeName, ManagedPreflightProbe> {
  const environment = input.environment ?? process.env;
  const pendingBootstrapConfigured = (now: Date) =>
    /^[a-f0-9]{64}$/u.test(environment.GOVERNANCE_BOOTSTRAP_TOKEN_SHA256 ?? '') &&
    Boolean(environment.GOVERNANCE_BOOTSTRAP_AUTHORIZATION_ID) &&
    new Date(environment.GOVERNANCE_BOOTSTRAP_EXPIRES_AT ?? 0) > now;
  return {
    'migration-status': async () => {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('migration-database-unavailable');
      const rows = await prisma.$queryRaw<
        Array<{ migration_name: string; finished_at: Date | null }>
      >`
        SELECT "migration_name", "finished_at"
        FROM "_prisma_migrations"
        WHERE "rolled_back_at" IS NULL
        ORDER BY "started_at" DESC
      `;
      const applied = rows.some(
        (row: { migration_name: string; finished_at: Date | null }) =>
          row.migration_name === input.expectedMigrationVersion && row.finished_at,
      );
      return {
        passed: Boolean(applied),
        reference: applied ? 'expected-migration-applied' : 'expected-migration-missing',
        details: {
          appliedMigrations: rows.filter(
            (row: { migration_name: string; finished_at: Date | null }) => row.finished_at,
          ).length,
        },
      };
    },
    database: async () => {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('database-unavailable');
      const rows = await prisma.$queryRaw<Array<{ ready: number }>>`SELECT 1::INTEGER AS "ready"`;
      return { passed: rows[0]?.ready === 1, reference: 'database-read-only-query' };
    },
    redis: async () => {
      const client = await createRedisCommandClient(required(environment, 'REDIS_URL'));
      try {
        const ready = String(await client.sendCommand(['PING'])) === 'PONG';
        return { passed: ready, reference: 'redis-ping' };
      } finally {
        await client.close?.();
      }
    },
    'object-storage': async () => {
      const endpoint = safeUrl(required(environment, 'OBJECT_STORAGE_ENDPOINT'), 'object-storage');
      const client = new S3Client({
        endpoint: endpoint.toString(),
        region: required(environment, 'OBJECT_STORAGE_REGION'),
        forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE !== 'false',
        credentials: {
          accessKeyId: required(environment, 'OBJECT_STORAGE_ACCESS_KEY'),
          secretAccessKey: required(environment, 'OBJECT_STORAGE_SECRET_KEY'),
        },
      });
      try {
        await client.send(
          new HeadBucketCommand({ Bucket: required(environment, 'OBJECT_STORAGE_BUCKET') }),
        );
        return { passed: true, reference: 'object-storage-head-bucket' };
      } finally {
        client.destroy();
      }
    },
    'notification-provider': async () => {
      if (required(environment, 'IDENTITY_EMAIL_DRIVER') !== 'resend') {
        throw new Error('notification-provider-driver-denied');
      }
      const response = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${required(environment, 'RESEND_API_KEY')}` },
        signal: AbortSignal.timeout(10_000),
      });
      return {
        passed: response.ok,
        reference: response.ok
          ? 'notification-provider-readiness'
          : 'notification-provider-rejected',
        details: { providerStatus: response.status },
      };
    },
    'search-vector': async () => {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('vector-database-unavailable');
      const rows = await prisma.$queryRaw<Array<{ ready: boolean }>>`
        SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS "ready"
      `;
      return { passed: rows[0]?.ready === true, reference: 'pgvector-extension-readiness' };
    },
    'application-health': async () => {
      const origin = safeUrl(required(environment, 'AUTH_PUBLIC_ORIGIN'), 'application-origin');
      const health = safeUrl(required(environment, 'GOVERNANCE_STAGING_HEALTH_URL'), 'health-url');
      if (origin.origin !== health.origin) throw new Error('health-origin-mismatch');
      const response = await fetch(health, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      return {
        passed: response.ok,
        reference: response.ok ? 'application-health-ready' : 'application-health-unavailable',
        details: { healthStatus: response.status },
      };
    },
    'governance-state': async () => {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('governance-database-unavailable');
      const now = new Date();
      const [activeOwners, pendingApprovals, activeSupportSessions] = await Promise.all([
        prisma.platformRoleAssignment.count({
          where: {
            role: 'PLATFORM_OWNER',
            active: true,
            disabledAt: null,
            user: { active: true, disabledAt: null },
          },
        }),
        prisma.governanceApprovalRequest.count({
          where: { status: { in: ['REQUESTED', 'APPROVED'] }, expiresAt: { gt: now } },
        }),
        prisma.platformSupportSession.count({ where: { endedAt: null, expiresAt: { gt: now } } }),
      ]);
      const pendingBootstrap = activeOwners === 0 && pendingBootstrapConfigured(now);
      return {
        passed: activeOwners > 0 || pendingBootstrap,
        reference: activeOwners > 0 ? 'active-owner-present' : 'pending-bootstrap-authorized',
        details: {
          activeOwners,
          pendingApprovals,
          activeSupportCount: activeSupportSessions,
          bootstrapPending: pendingBootstrap,
        },
      };
    },
    'governance-invariants': async () => {
      const report = await validateGovernanceInvariants();
      const failed = report.invariants.filter((item) => !item.passed);
      const pendingBootstrapException =
        failed.length === 1 &&
        failed[0]?.name === 'active-platform-owner' &&
        pendingBootstrapConfigured(new Date());
      const passed = report.status === 'passed' || pendingBootstrapException;
      return {
        passed,
        reference: passed
          ? pendingBootstrapException
            ? 'governance-invariants-bootstrap-pending'
            : 'governance-invariants-passed'
          : 'governance-invariants-failed',
        details: {
          invariantCount: report.invariants.length,
          failedInvariants: failed.length,
        },
      };
    },
    'version-compatibility': async () => {
      const expected = required(environment, 'GOVERNANCE_EXPECTED_APP_VERSION');
      const deployed = required(environment, 'APP_VERSION');
      return {
        passed: expected === deployed,
        reference:
          expected === deployed ? 'application-version-compatible' : 'application-version-mismatch',
      };
    },
  };
}
