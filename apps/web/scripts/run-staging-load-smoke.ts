import {
  loadDocumentIntegrationEnvironment,
  runIntegrationCommand,
} from './document-integration-environment';

async function main() {
  if (!process.argv.includes('--integration')) {
    console.log(
      JSON.stringify({
        status: 'planned',
        execution: 'disabled_by_default',
        requiredFlag: '--integration',
        maximumConcurrency: 32,
        data: 'deterministic-synthetic-only',
      }),
    );
    return;
  }
  const { repositoryRoot, environment } = await loadDocumentIntegrationEnvironment();
  await runIntegrationCommand(
    'npm',
    ['run', 'pgvector:load-test', '--', '--integration', '--smoke'],
    {
      cwd: repositoryRoot,
      environment: {
        ...environment,
        PGVECTOR_LOAD_TEST_ALLOWED: 'true',
        PGVECTOR_LOAD_SEED: environment.PGVECTOR_LOAD_SEED || '42',
      },
    },
  );
  console.log(
    JSON.stringify({
      status: 'completed',
      scope: 'controlled-local-vector-capacity-smoke',
      coveredMetrics: ['p50', 'p95', 'p99', 'qps', 'recall', 'indexBytes', 'timeouts'],
      pendingStagingMetrics: [
        'web error rate',
        'queue age',
        'worker utilization',
        'database connections',
        'Redis latency',
        'OCR latency',
        'AI latency and estimated cost',
        'no-answer rate',
      ],
    }),
  );
}

void main().catch(() => {
  console.error(JSON.stringify({ status: 'failed', errorCode: 'STAGING_LOAD_SMOKE_FAILED' }));
  process.exitCode = 1;
});
