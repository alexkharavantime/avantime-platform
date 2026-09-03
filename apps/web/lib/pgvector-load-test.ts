import type { VectorDatabaseLoader } from './vector-repository';

export type PgvectorLoadConfiguration = {
  tenants: number;
  documentsPerTenant: number;
  chunksPerDocument: number;
  dimensions: number;
  concurrentQueries: number;
  queryCount: number;
  topK: number;
  seed: number;
  strategies: readonly ('exact' | 'ivfflat' | 'hnsw')[];
};

export type PgvectorStrategyMetrics = {
  strategy: 'exact' | 'ivfflat' | 'hnsw';
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  qps: number;
  recall: number;
  indexBytes: number;
  sequentialScans: number;
  timeoutCount: number;
  tenantLeakageCount: number;
};

export const PGVECTOR_QUALITY_THRESHOLDS = {
  activeProductionStrategy: 'exact',
  exact: {
    minimumRecall: 1,
    maximumTimeoutCount: 0,
    maximumTenantLeakageCount: 0,
    maximumSequentialScans: null,
    sequentialScanPolicy: 'ALLOWED_AT_MEASURED_SCALE',
    maximumP95Ms: null,
  },
  ann: {
    minimumRecall: 0.95,
    maximumTimeoutCount: 0,
    maximumTenantLeakageCount: 0,
    maximumSequentialScans: 0,
    sequentialScanPolicy: 'REJECT_FOR_APPROVAL',
    minimumP95ImprovementRatio: 0.3,
  },
} as const;

export type PgvectorQualityEvaluation = {
  status: 'PASS' | 'FAIL';
  activeProductionStrategy: 'exact';
  thresholds: typeof PGVECTOR_QUALITY_THRESHOLDS;
  strategies: Array<{
    strategy: PgvectorStrategyMetrics['strategy'];
    classification: 'ACTIVE_PRODUCTION' | 'INFORMATIONAL';
    approval: 'APPROVED' | 'NOT_APPROVED';
    message: string;
    p95ImprovementRatio: number | null;
    failures: string[];
  }>;
};

const TABLE = '"Task005VectorLoadSample"';
const INDEX = '"Task005VectorLoadSample_embedding_idx"';

function assertPositiveInteger(value: number, name: string, maximum: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be a positive integer not greater than ${maximum}.`);
  }
}

export function validatePgvectorLoadConfiguration(configuration: PgvectorLoadConfiguration) {
  assertPositiveInteger(configuration.tenants, 'tenants', 1_000);
  assertPositiveInteger(configuration.documentsPerTenant, 'documentsPerTenant', 100_000);
  assertPositiveInteger(configuration.chunksPerDocument, 'chunksPerDocument', 100_000);
  assertPositiveInteger(configuration.dimensions, 'dimensions', 4_096);
  assertPositiveInteger(configuration.concurrentQueries, 'concurrentQueries', 256);
  assertPositiveInteger(configuration.queryCount, 'queryCount', 100_000);
  assertPositiveInteger(configuration.topK, 'topK', 100);
  assertPositiveInteger(configuration.seed, 'seed', 2_147_483_647);
  if (
    configuration.strategies.length === 0 ||
    configuration.strategies.some((strategy) => !['exact', 'ivfflat', 'hnsw'].includes(strategy))
  ) {
    throw new Error('At least one supported pgvector strategy is required.');
  }
}

export function evaluatePgvectorQuality(
  metrics: readonly PgvectorStrategyMetrics[],
): PgvectorQualityEvaluation {
  const exactMetric = metrics.find((metric) => metric.strategy === 'exact');
  const strategies = metrics.map((metric) => {
    const active = metric.strategy === PGVECTOR_QUALITY_THRESHOLDS.activeProductionStrategy;
    const threshold = active ? PGVECTOR_QUALITY_THRESHOLDS.exact : PGVECTOR_QUALITY_THRESHOLDS.ann;
    const failures: string[] = [];
    if (metric.recall < threshold.minimumRecall) failures.push('RECALL_BELOW_THRESHOLD');
    if (metric.timeoutCount > threshold.maximumTimeoutCount) {
      failures.push('TIMEOUT_THRESHOLD_EXCEEDED');
    }
    if (metric.tenantLeakageCount > threshold.maximumTenantLeakageCount) {
      failures.push('TENANT_LEAKAGE_THRESHOLD_EXCEEDED');
    }
    if (
      threshold.maximumSequentialScans !== null &&
      metric.sequentialScans > threshold.maximumSequentialScans
    ) {
      failures.push('SEQUENTIAL_SCAN_POLICY_VIOLATION');
    }
    const p95ImprovementRatio =
      active || !exactMetric || exactMetric.p95Ms <= 0
        ? null
        : (exactMetric.p95Ms - metric.p95Ms) / exactMetric.p95Ms;
    if (
      !active &&
      (p95ImprovementRatio === null ||
        p95ImprovementRatio < PGVECTOR_QUALITY_THRESHOLDS.ann.minimumP95ImprovementRatio)
    ) {
      failures.push('P95_IMPROVEMENT_BELOW_THRESHOLD');
    }
    const approval: 'APPROVED' | 'NOT_APPROVED' =
      failures.length === 0 ? 'APPROVED' : 'NOT_APPROVED';
    return {
      strategy: metric.strategy,
      classification: active ? ('ACTIVE_PRODUCTION' as const) : ('INFORMATIONAL' as const),
      approval,
      message: active
        ? `EXACT ACTIVE / ${approval === 'APPROVED' ? 'PASS' : 'FAIL'}`
        : `ANN ${approval === 'APPROVED' ? 'APPROVED' : 'NOT APPROVED'} / INFORMATIONAL`,
      p95ImprovementRatio,
      failures,
    };
  });
  const exact = strategies.find((strategy) => strategy.strategy === 'exact');
  return {
    status: exact?.approval === 'APPROVED' ? 'PASS' : 'FAIL',
    activeProductionStrategy: PGVECTOR_QUALITY_THRESHOLDS.activeProductionStrategy,
    thresholds: PGVECTOR_QUALITY_THRESHOLDS,
    strategies,
  };
}

function generator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function vector(random: () => number, dimensions: number) {
  const values = Array.from({ length: dimensions }, () => random() * 2 - 1);
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return `[${values.map((value) => (value / magnitude).toFixed(8)).join(',')}]`;
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function recall(expected: readonly string[], actual: readonly string[]) {
  if (expected.length === 0) return 1;
  const actualSet = new Set(actual);
  return expected.filter((id) => actualSet.has(id)).length / expected.length;
}

export async function runPgvectorLoadTest(
  loadDatabase: VectorDatabaseLoader,
  configuration: PgvectorLoadConfiguration,
): Promise<PgvectorStrategyMetrics[]> {
  validatePgvectorLoadConfiguration(configuration);
  const database = await loadDatabase();
  if (!database) throw new Error('pgvector load-test database is unavailable.');
  const databaseInfo = await database.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT current_database() AS "name"`,
  );
  if (!/(integration|test|rehearsal)/i.test(databaseInfo[0]?.name ?? '')) {
    throw new Error('pgvector load test is restricted to an isolated test database.');
  }
  const random = generator(configuration.seed);
  const total =
    configuration.tenants * configuration.documentsPerTenant * configuration.chunksPerDocument;
  try {
    await database.$executeRawUnsafe(`DROP TABLE IF EXISTS ${TABLE}`);
    await database.$executeRawUnsafe(
      `CREATE UNLOGGED TABLE ${TABLE} (
         "id" text PRIMARY KEY,
         "companyId" text NOT NULL,
         "embedding" vector(${configuration.dimensions}) NOT NULL
       )`,
    );
    await database.$executeRawUnsafe(
      `CREATE INDEX "Task005VectorLoadSample_company_idx" ON ${TABLE} ("companyId")`,
    );
    for (let index = 0; index < total; index += 1) {
      const tenantIndex =
        Math.floor(index / (configuration.documentsPerTenant * configuration.chunksPerDocument)) %
        configuration.tenants;
      await database.$executeRawUnsafe(
        `INSERT INTO ${TABLE} ("id", "companyId", "embedding") VALUES ($1, $2, $3::vector)`,
        `chunk-${index}`,
        `tenant-${tenantIndex}`,
        vector(random, configuration.dimensions),
      );
    }
    await database.$executeRawUnsafe(`ANALYZE ${TABLE}`);
    const queries = Array.from({ length: configuration.queryCount }, (_, index) => ({
      tenant: `tenant-${index % configuration.tenants}`,
      value: vector(random, configuration.dimensions),
    }));
    const exactResults = await Promise.all(
      queries.map(async (query) => {
        const rows = await database.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM ${TABLE}
           WHERE "companyId" = $1
           ORDER BY "embedding" <=> $2::vector LIMIT $3`,
          query.tenant,
          query.value,
          configuration.topK,
        );
        return rows.map((row) => row.id);
      }),
    );
    const metrics: PgvectorStrategyMetrics[] = [];
    for (const strategy of configuration.strategies) {
      await database.$executeRawUnsafe(`DROP INDEX IF EXISTS ${INDEX}`);
      if (strategy === 'ivfflat') {
        const lists = Math.max(1, Math.round(Math.sqrt(total)));
        await database.$executeRawUnsafe(
          `CREATE INDEX ${INDEX} ON ${TABLE} USING ivfflat ("embedding" vector_cosine_ops)
           WITH (lists = ${lists})`,
        );
        await database.$executeRawUnsafe(
          `SET ivfflat.probes = ${Math.max(1, Math.ceil(lists / 10))}`,
        );
      }
      if (strategy === 'hnsw') {
        await database.$executeRawUnsafe(
          `CREATE INDEX ${INDEX} ON ${TABLE} USING hnsw ("embedding" vector_cosine_ops)
           WITH (m = 16, ef_construction = 64)`,
        );
        await database.$executeRawUnsafe(`SET hnsw.ef_search = 40`);
      }
      await database.$executeRawUnsafe(`ANALYZE ${TABLE}`);
      const statsBefore = await database.$queryRawUnsafe<Array<{ sequentialScans: bigint }>>(
        `SELECT COALESCE("seq_scan", 0)::bigint AS "sequentialScans"
         FROM pg_stat_user_tables WHERE "relname" = $1`,
        TABLE.replaceAll('"', ''),
      );
      const startedAt = performance.now();
      const latencies: number[] = [];
      const recalls: number[] = [];
      let timeoutCount = 0;
      let tenantLeakageCount = 0;
      for (let offset = 0; offset < queries.length; offset += configuration.concurrentQueries) {
        await Promise.all(
          queries
            .slice(offset, offset + configuration.concurrentQueries)
            .map(async (query, batchIndex) => {
              const queryStartedAt = performance.now();
              try {
                const rows = await database.$queryRawUnsafe<
                  Array<{ id: string; companyId: string }>
                >(
                  `SELECT "id", "companyId" FROM ${TABLE}
                   WHERE "companyId" = $1
                   ORDER BY "embedding" <=> $2::vector LIMIT $3`,
                  query.tenant,
                  query.value,
                  configuration.topK,
                );
                recalls.push(
                  recall(
                    exactResults[offset + batchIndex],
                    rows.map((row) => row.id),
                  ),
                );
                tenantLeakageCount += rows.filter((row) => row.companyId !== query.tenant).length;
              } catch {
                timeoutCount += 1;
              } finally {
                latencies.push(performance.now() - queryStartedAt);
              }
            }),
        );
      }
      const durationMs = performance.now() - startedAt;
      const stats = await database.$queryRawUnsafe<
        Array<{ sequentialScans: bigint; indexBytes: bigint }>
      >(
        `SELECT COALESCE("seq_scan", 0)::bigint AS "sequentialScans",
          COALESCE(pg_indexes_size($2::regclass), 0)::bigint AS "indexBytes"
         FROM pg_stat_user_tables WHERE "relname" = $1`,
        TABLE.replaceAll('"', ''),
        TABLE,
      );
      metrics.push({
        strategy,
        p50Ms: Number(percentile(latencies, 0.5).toFixed(3)),
        p95Ms: Number(percentile(latencies, 0.95).toFixed(3)),
        p99Ms: Number(percentile(latencies, 0.99).toFixed(3)),
        qps: Number(((queries.length / durationMs) * 1_000).toFixed(2)),
        recall:
          recalls.length > 0
            ? Number((recalls.reduce((sum, value) => sum + value, 0) / recalls.length).toFixed(4))
            : 0,
        sequentialScans: Math.max(
          0,
          Number(stats[0]?.sequentialScans ?? 0) - Number(statsBefore[0]?.sequentialScans ?? 0),
        ),
        indexBytes: Number(stats[0]?.indexBytes ?? 0),
        timeoutCount,
        tenantLeakageCount,
      });
    }
    return metrics;
  } finally {
    await database.$executeRawUnsafe(`DROP TABLE IF EXISTS ${TABLE}`);
  }
}
