import path from 'node:path';

import {
  loadDocumentIntegrationEnvironment,
  runIntegrationCommand,
} from './document-integration-environment';

async function main() {
  const { repositoryRoot, environment } = await loadDocumentIntegrationEnvironment();
  await runIntegrationCommand(
    process.execPath,
    [
      '--import',
      'tsx',
      '--test',
      path.join(
        repositoryRoot,
        'apps/web/tests/integration/production-readiness.integration.test.ts',
      ),
    ],
    {
      cwd: repositoryRoot,
      environment: {
        ...environment,
        RUN_PRODUCTION_INTEGRATION_TESTS: '1',
        REDIS_URL: environment.REDIS_URL || 'redis://:avantime_redis_test_only@127.0.0.1:56379/0',
      },
    },
  );
}

void main().catch(() => {
  console.error('Production readiness integration tests failed.');
  process.exitCode = 1;
});
