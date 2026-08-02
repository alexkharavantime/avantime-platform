import { randomUUID } from 'node:crypto';

import { getPrisma } from '@avantime/database';

import { validateGovernanceInvariants } from './governance-invariants';
import { createNotificationProvider } from './notification-providers';
import { createRedisCommandClient } from './redis-lease-queue';
import {
  loadStagingConfiguration,
  summarizeStagingConfiguration,
  type SafeStagingConfigurationSummary,
} from './staging-configuration';
import { probeStagingObjectStorage } from './staging-object-storage';
import { probeStagingRedis } from './staging-redis';

export type StagingComponentName =
  | 'environment'
  | 'database'
  | 'migrations'
  | 'redis'
  | 'objectStorage'
  | 'notificationAdapter'
  | 'notificationWorker'
  | 'knowledgeIndex'
  | 'knowledgeWorker'
  | 'governance';

export type StagingComponentResult = {
  status: 'ready' | 'degraded' | 'unavailable';
  latencyMs: number;
  code: string;
  details?: Record<string, string | number | boolean | null>;
};

export type StagingReadinessReport = {
  status: 'ready' | 'unavailable';
  environment: 'staging';
  correlationId: string;
  checkedAt: string;
  versions: { application: string; commitSha: string; migration: string; schema: string | null };
  components: Record<StagingComponentName, StagingComponentResult>;
  configuration?: SafeStagingConfigurationSummary;
};

const SAFE_CORRELATION = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,99}$/u;

async function timed(
  action: () => Promise<Omit<StagingComponentResult, 'latencyMs'>>,
  timeoutMs = 10_000,
): Promise<StagingComponentResult> {
  const started = performance.now();
  try {
    const result = await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        const timeout = setTimeout(() => reject(new Error('READINESS_TIMEOUT')), timeoutMs);
        timeout.unref?.();
      }),
    ]);
    return { ...result, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9][A-Z0-9_-]{2,99}$/u.test(error.message)
        ? error.message
        : 'COMPONENT_UNAVAILABLE';
    return {
      status: 'unavailable',
      latencyMs: Math.round(performance.now() - started),
      code,
    };
  }
}

function heartbeatReady(heartbeatAt: Date | null | undefined, now: Date) {
  return Boolean(heartbeatAt && now.getTime() - heartbeatAt.getTime() <= 120_000);
}

export async function checkStagingReadiness(
  input: {
    correlationId?: string;
    includeDetails?: boolean;
    environment?: NodeJS.ProcessEnv;
    now?: Date;
  } = {},
): Promise<StagingReadinessReport> {
  const environment = input.environment ?? process.env;
  const now = input.now ?? new Date();
  const correlationId = SAFE_CORRELATION.test(input.correlationId ?? '')
    ? input.correlationId!
    : randomUUID();
  const components = {} as Record<StagingComponentName, StagingComponentResult>;
  let configuration: ReturnType<typeof loadStagingConfiguration>;
  try {
    configuration = loadStagingConfiguration(environment);
    components.environment = {
      status: 'ready',
      latencyMs: 0,
      code: 'ENVIRONMENT_VALID',
    };
  } catch (error) {
    components.environment = {
      status: 'unavailable',
      latencyMs: 0,
      code:
        error instanceof Error && /^[A-Z0-9][A-Z0-9_-]{2,99}$/u.test(error.message)
          ? error.message
          : 'ENVIRONMENT_INVALID',
    };
    const unavailable = (): StagingComponentResult => ({
      status: 'unavailable',
      latencyMs: 0,
      code: 'ENVIRONMENT_INVALID',
    });
    for (const name of [
      'database',
      'migrations',
      'redis',
      'objectStorage',
      'notificationAdapter',
      'notificationWorker',
      'knowledgeIndex',
      'knowledgeWorker',
      'governance',
    ] as StagingComponentName[]) {
      components[name] = unavailable();
    }
    return {
      status: 'unavailable',
      environment: 'staging',
      correlationId,
      checkedAt: now.toISOString(),
      versions: {
        application: 'invalid',
        commitSha: 'invalid',
        migration: 'invalid',
        schema: null,
      },
      components,
    };
  }

  const prisma = await getPrisma();
  components.database = await timed(async () => {
    if (!prisma) throw new Error('DATABASE_UNAVAILABLE');
    const rows = await prisma.$queryRaw<Array<{ ready: number }>>`SELECT 1::INTEGER AS "ready"`;
    return {
      status: rows[0]?.ready === 1 ? 'ready' : 'unavailable',
      code: rows[0]?.ready === 1 ? 'DATABASE_READY' : 'DATABASE_QUERY_FAILED',
    };
  });

  let schemaVersion: string | null = null;
  components.migrations = await timed(async () => {
    if (!prisma) throw new Error('DATABASE_UNAVAILABLE');
    const rows = (await prisma.$queryRaw`
      SELECT "migration_name", "finished_at", "rolled_back_at"
      FROM "_prisma_migrations"
      ORDER BY "started_at" DESC
    `) as Array<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>;
    const failed = rows.some((row) => !row.finished_at && !row.rolled_back_at);
    const current =
      rows.find((row) => row.finished_at && !row.rolled_back_at)?.migration_name ?? null;
    schemaVersion = current;
    const ready = !failed && current === configuration.versions.migration;
    return {
      status: ready ? 'ready' : 'unavailable',
      code: ready ? 'MIGRATIONS_CURRENT' : failed ? 'MIGRATION_FAILED' : 'MIGRATIONS_PENDING',
      details: input.includeDetails
        ? { applied: rows.filter((row) => row.finished_at).length }
        : undefined,
    };
  });

  components.redis = await timed(async () => {
    const client = await createRedisCommandClient(configuration.redis.url.toString(), {
      connectTimeoutMs: configuration.redis.connectTimeoutMs,
    });
    try {
      await probeStagingRedis(client, configuration.redis.namespace, correlationId);
      return { status: 'ready', code: 'REDIS_READY' };
    } finally {
      await client.close?.();
    }
  });
  if (!configuration.redis.requiredForReadiness && components.redis.status === 'unavailable') {
    components.redis.status = 'degraded';
  }

  components.objectStorage = await timed(async () => {
    await probeStagingObjectStorage(configuration.objectStorage);
    return { status: 'ready', code: 'OBJECT_STORAGE_READY' };
  });

  components.notificationAdapter = await timed(async () => {
    const ready = await createNotificationProvider(environment).checkReadiness();
    return {
      status: ready ? 'ready' : 'unavailable',
      code: ready ? 'NOTIFICATION_ADAPTER_READY' : 'NOTIFICATION_ADAPTER_UNAVAILABLE',
    };
  });

  components.notificationWorker = await timed(async () => {
    if (!prisma) throw new Error('DATABASE_UNAVAILABLE');
    const heartbeat = await prisma.notificationWorkerHeartbeat.findFirst({
      orderBy: { heartbeatAt: 'desc' },
    });
    const deadLetters = await prisma.notificationOutbox.count({ where: { status: 'DEAD_LETTER' } });
    const ready =
      heartbeatReady(heartbeat?.heartbeatAt, now) &&
      heartbeat?.deploymentGeneration === configuration.versions.deploymentGeneration;
    return {
      status: ready ? 'ready' : 'unavailable',
      code: ready ? 'NOTIFICATION_WORKER_READY' : 'NOTIFICATION_WORKER_STALE',
      details: input.includeDetails ? { deadLetters } : undefined,
    };
  });

  components.knowledgeIndex = await timed(async () => {
    if (!prisma) throw new Error('DATABASE_UNAVAILABLE');
    const rows = await prisma.$queryRaw<Array<{ vector_ready: boolean; tables_ready: boolean }>>`
      SELECT
        EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS "vector_ready",
        to_regclass('"KnowledgeSearchIndex"') IS NOT NULL
          AND to_regclass('"KnowledgeVectorIndex"') IS NOT NULL AS "tables_ready"
    `;
    const ready = rows[0]?.vector_ready && rows[0]?.tables_ready;
    return {
      status: ready ? 'ready' : 'unavailable',
      code: ready ? 'KNOWLEDGE_INDEX_READY' : 'KNOWLEDGE_INDEX_UNAVAILABLE',
    };
  });

  components.knowledgeWorker = await timed(async () => {
    if (!prisma) throw new Error('DATABASE_UNAVAILABLE');
    const heartbeat = await prisma.knowledgeIndexWorkerHeartbeat.findFirst({
      orderBy: { heartbeatAt: 'desc' },
    });
    const deadLetters = await prisma.knowledgeIndexEvent.count({
      where: { status: 'DEAD_LETTER' },
    });
    const ready =
      heartbeatReady(heartbeat?.heartbeatAt, now) &&
      heartbeat?.deploymentGeneration === configuration.versions.deploymentGeneration;
    return {
      status: ready ? 'ready' : 'unavailable',
      code: ready ? 'KNOWLEDGE_WORKER_READY' : 'KNOWLEDGE_WORKER_STALE',
      details: input.includeDetails ? { deadLetters } : undefined,
    };
  });

  components.governance = await timed(async () => {
    const report = await validateGovernanceInvariants(now);
    const failed = report.invariants.filter((invariant) => !invariant.passed);
    const localBootstrapPending =
      configuration.mode === 'local' &&
      failed.length === 1 &&
      failed[0]?.name === 'active-platform-owner';
    return {
      status:
        report.status === 'passed' ? 'ready' : localBootstrapPending ? 'degraded' : 'unavailable',
      code:
        report.status === 'passed'
          ? 'GOVERNANCE_INVARIANTS_READY'
          : localBootstrapPending
            ? 'GOVERNANCE_BOOTSTRAP_PENDING'
            : 'GOVERNANCE_INVARIANTS_FAILED',
      details: input.includeDetails ? { failed: failed.length } : undefined,
    };
  });

  const status = Object.values(components).every(
    (component) => component.status === 'ready' || component.status === 'degraded',
  )
    ? 'ready'
    : 'unavailable';
  return {
    status,
    environment: 'staging',
    correlationId,
    checkedAt: now.toISOString(),
    versions: {
      application: configuration.versions.application,
      commitSha: configuration.versions.commitSha,
      migration: configuration.versions.migration,
      schema: schemaVersion,
    },
    components,
    configuration: input.includeDetails ? summarizeStagingConfiguration(configuration) : undefined,
  };
}

export function publicStagingReadiness(report: StagingReadinessReport) {
  return {
    status: report.status,
    correlationId: report.correlationId,
    components: Object.fromEntries(
      Object.entries(report.components).map(([name, component]) => [
        name,
        { status: component.status, latencyMs: component.latencyMs },
      ]),
    ),
  };
}
