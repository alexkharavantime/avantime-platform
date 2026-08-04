import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BROWSER_ARTIFACT_DIRECTORY } from '../tests/browser/environment';
import { sanitizePlaywrightArtifacts } from './sanitize-playwright-artifacts';

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function run(command: string, args: string[]) {
  return spawnSync(command, args, {
    cwd: webDirectory,
    env: process.env,
    stdio: 'inherit',
  });
}

async function main() {
  const prepare = run(process.execPath, ['--import', 'tsx', 'scripts/prepare-browser-tests.ts']);
  if (prepare.status !== 0) process.exit(prepare.status ?? 1);

  const result = run(process.execPath, [
    require.resolve('@playwright/test/cli'),
    'test',
    ...process.argv.slice(2),
  ]);
  await sanitizePlaywrightArtifacts(BROWSER_ARTIFACT_DIRECTORY);
  process.exit(result.status ?? 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Browser test runner failed.');
  process.exit(1);
});
