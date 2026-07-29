import { readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  loadDocumentIntegrationEnvironment,
  runIntegrationCommand,
} from './document-integration-environment';

async function main() {
  const { repositoryRoot, environment } = await loadDocumentIntegrationEnvironment();
  const schema = path.join(repositoryRoot, 'packages', 'database', 'prisma', 'schema.prisma');
  const integrationTestsDirectory = path.join(
    repositoryRoot,
    'apps',
    'web',
    'tests',
    'integration',
  );
  const tests = (await readdir(integrationTestsDirectory))
    .filter(
      (file) =>
        file.endsWith('.integration.test.ts') && file !== 'document-ocr.integration.test.ts',
    )
    .sort()
    .map((file) => path.join(integrationTestsDirectory, file));
  if (tests.length === 0) {
    throw new Error('No document integration tests were found.');
  }

  await runIntegrationCommand('npx', ['prisma', 'migrate', 'deploy', '--schema', schema], {
    cwd: repositoryRoot,
    environment,
  });
  await runIntegrationCommand(process.execPath, ['--import', 'tsx', '--test', ...tests], {
    cwd: repositoryRoot,
    environment,
  });
}

void main().catch(() => {
  console.error('Document integration tests failed.');
  process.exitCode = 1;
});
