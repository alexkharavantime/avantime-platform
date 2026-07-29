import path from 'node:path';

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
        externalStaging: 'requires deployed hostname and synthetic ADMIN session',
      }),
    );
    return;
  }
  const { repositoryRoot, environment } = await loadDocumentIntegrationEnvironment();
  const tests = [
    'document-processing.integration.test.ts',
    'hybrid-rag.integration.test.ts',
    'production-readiness.integration.test.ts',
  ].map((filename) => path.join(repositoryRoot, 'apps', 'web', 'tests', 'integration', filename));
  await runIntegrationCommand(process.execPath, ['--import', 'tsx', '--test', ...tests], {
    cwd: repositoryRoot,
    environment: {
      ...environment,
      RUN_PRODUCTION_INTEGRATION_TESTS: '1',
    },
  });
  console.log(
    JSON.stringify({
      status: 'completed',
      scope: 'local-staging-like',
      syntheticTenants: true,
      checks: [
        'document storage/processing',
        'tenant isolation',
        'embedding/vector/hybrid RAG/citations/reindex',
        'Redis queue/fencing/rate limit',
        'budget ledger/audit',
      ],
      pendingExternalChecks: ['login over TLS', 'real provider', 'alert delivery'],
    }),
  );
}

void main().catch(() => {
  console.error(JSON.stringify({ status: 'failed', errorCode: 'STAGING_SMOKE_FAILED' }));
  process.exitCode = 1;
});
