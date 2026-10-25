import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webDirectory = path.resolve(scriptDirectory, '..');
const testDirectory = path.join(webDirectory, 'tests');

async function main() {
  const testFiles = (await readdir(testDirectory))
    .filter((file) => file.endsWith('.test.ts'))
    .sort()
    .map((file) => path.join(testDirectory, file));

  if (testFiles.length === 0) {
    throw new Error('No unit test files were found in apps/web/tests.');
  }

  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...testFiles], {
    cwd: webDirectory,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});