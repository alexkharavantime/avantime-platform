import path from 'node:path';

import {
  loadDocumentIntegrationEnvironment,
  runIntegrationCommand,
} from './document-integration-environment';

async function main() {
  const { repositoryRoot, environment } = await loadDocumentIntegrationEnvironment();
  const schema = path.join(repositoryRoot, 'packages', 'database', 'prisma', 'schema.prisma');
  const testFile = path.join(
    repositoryRoot,
    'apps',
    'web',
    'tests',
    'integration',
    'hybrid-rag.integration.test.ts',
  );
  await runIntegrationCommand('npx', ['prisma', 'migrate', 'deploy', '--schema', schema], {
    cwd: repositoryRoot,
    environment,
  });
  await runIntegrationCommand('npx', ['tsx', '--test', testFile], {
    cwd: repositoryRoot,
    environment,
  });
}

void main().catch(() => {
  console.error('RAG integration tests failed.');
  process.exitCode = 1;
});
