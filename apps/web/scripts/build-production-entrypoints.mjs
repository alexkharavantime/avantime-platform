import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const configuredOutput = process.argv.find((argument) => argument.startsWith('--outdir='));
const outputDirectory = path.resolve(
  repositoryRoot,
  configuredOutput?.slice('--outdir='.length) ?? '.artifacts/production-entrypoints',
);
if (
  outputDirectory !== path.join(repositoryRoot, '.artifacts', 'production-entrypoints') &&
  outputDirectory !== path.join(repositoryRoot, 'production-entrypoints')
) {
  throw new Error('Production entrypoint output must use an approved repository directory.');
}

const entryPoints = {
  'document-worker': 'apps/web/scripts/run-document-worker.ts',
  'embedding-worker': 'apps/web/scripts/run-document-embedding-worker.ts',
  'production-readiness': 'apps/web/scripts/check-production-readiness.ts',
  'production-configuration': 'apps/web/scripts/check-production-configuration.ts',
  'queue-health': 'apps/web/scripts/check-production-queues.ts',
  'worker-heartbeats': 'apps/web/scripts/check-worker-heartbeats.ts',
  'ai-cost-report': 'apps/web/scripts/report-ai-cost.ts',
  'ai-budget-check': 'apps/web/scripts/check-ai-budget.ts',
  'backup-production': 'apps/web/scripts/backup-production.ts',
  'backup-object-storage': 'apps/web/scripts/backup-object-storage.ts',
  'backup-status': 'apps/web/scripts/check-backup-status.ts',
  'restore-rehearsal': 'apps/web/scripts/restore-rehearsal.ts',
  'document-health': 'apps/web/scripts/check-document-health.ts',
  'document-worker-check': 'apps/web/scripts/check-document-worker.ts',
  'document-ocr-check': 'apps/web/scripts/check-document-ocr.ts',
  'document-embedding-check': 'apps/web/scripts/check-document-embedding.ts',
  'document-vector-check': 'apps/web/scripts/check-document-vector.ts',
  'ocr-integration-test': 'apps/web/tests/integration/document-ocr.integration.test.ts',
};

const workspaceSources = new Map([
  ['@avantime/database', path.join(repositoryRoot, 'packages', 'database', 'src', 'index.ts')],
  ['@avantime/shared', path.join(repositoryRoot, 'packages', 'shared', 'src', 'index.ts')],
]);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true, mode: 0o755 });
await build({
  absWorkingDir: repositoryRoot,
  entryPoints,
  outdir: outputDirectory,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  sourcesContent: false,
  legalComments: 'none',
  logLevel: 'info',
  plugins: [
    {
      name: 'avantime-workspaces',
      setup(buildContext) {
        buildContext.onResolve({ filter: /^@avantime\/(?:database|shared)$/ }, (arguments_) => {
          const resolved = workspaceSources.get(arguments_.path);
          if (!resolved) return undefined;
          return { path: resolved };
        });
      },
    },
  ],
});
await writeFile(
  path.join(outputDirectory, 'manifest.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      format: 'esm',
      sourceMaps: false,
      entrypoints: Object.keys(entryPoints).map((name) => `${name}.mjs`),
    },
    null,
    2,
  )}\n`,
  { mode: 0o644 },
);
