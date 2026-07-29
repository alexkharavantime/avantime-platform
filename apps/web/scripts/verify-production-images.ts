import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getRepositoryRoot } from './document-integration-environment';

const executeFile = promisify(execFile);
const repositoryRoot = getRepositoryRoot();

type ImageDefinition = {
  name: string;
  image: string;
  workdir: string;
  required: readonly string[];
  requiredCommands?: readonly string[];
  forbiddenCommands?: readonly string[];
  testOnly?: boolean;
};

const images = [
  {
    name: 'web',
    image: 'avantime-web:task-006-staging',
    workdir: '/app',
    required: ['apps/web/server.js'],
    forbiddenCommands: ['tesseract', 'pdftoppm', 'pdfinfo'],
  },
  {
    name: 'document-worker',
    image: 'avantime-document-worker:task-006-staging',
    workdir: '/workspace',
    required: ['production-entrypoints/document-worker.mjs'],
    requiredCommands: ['tesseract', 'pdftoppm', 'pdfinfo'],
  },
  {
    name: 'embedding-worker',
    image: 'avantime-embedding-worker:task-006-staging',
    workdir: '/workspace',
    required: ['production-entrypoints/embedding-worker.mjs'],
    forbiddenCommands: ['tesseract', 'pdftoppm', 'pdfinfo'],
  },
  {
    name: 'migration',
    image: 'avantime-migration:task-006-staging',
    workdir: '/workspace',
    required: ['node_modules/prisma/build/index.js', 'packages/database/prisma/schema.prisma'],
    forbiddenCommands: ['tesseract', 'pdftoppm', 'pdfinfo'],
  },
  {
    name: 'operations',
    image: 'avantime-operations:task-006-staging',
    workdir: '/workspace',
    required: [
      'production-entrypoints/production-readiness.mjs',
      'production-entrypoints/backup-production.mjs',
      'production-entrypoints/restore-rehearsal.mjs',
    ],
    forbiddenCommands: ['tesseract', 'pdftoppm', 'pdfinfo'],
  },
  {
    name: 'ocr-integration',
    image: 'avantime-ocr-integration',
    workdir: '/workspace',
    required: ['ocr-integration-test.mjs'],
    requiredCommands: ['tesseract', 'pdftoppm', 'pdfinfo'],
    testOnly: true,
  },
] as const satisfies readonly ImageDefinition[];

async function docker(arguments_: string[]) {
  return executeFile('docker', arguments_, {
    cwd: repositoryRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function main() {
  const results = [];
  for (const definition of images as readonly ImageDefinition[]) {
    const { stdout: inspectionOutput } = await docker(['image', 'inspect', definition.image]);
    const inspection = JSON.parse(inspectionOutput)[0] as {
      Id: string;
      Config: { User?: string; Entrypoint?: string[]; Cmd?: string[] };
    };
    assert.ok(inspection.Id, `${definition.name}: image ID is missing.`);
    assert.notEqual(inspection.Config.User, '', `${definition.name}: image must not run as root.`);
    assert.notEqual(inspection.Config.User, '0', `${definition.name}: image must not run as root.`);
    assert.notEqual(
      inspection.Config.User,
      'root',
      `${definition.name}: image must not run as root.`,
    );
    const startup = [
      ...(inspection.Config.Entrypoint ?? []),
      ...(inspection.Config.Cmd ?? []),
    ].join(' ');
    assert.doesNotMatch(
      startup,
      /(?:^|\s)(?:tsx|typescript|npm|npx)(?:\s|$)|--import\s+tsx/,
      `${definition.name}: production command contains build tooling.`,
    );

    const checks = [
      'set -eu',
      `cd ${definition.workdir}`,
      'test ! -e node_modules/tsx',
      'test ! -e node_modules/esbuild',
      'test ! -e node_modules/@esbuild',
      'test ! -e node_modules/typescript',
      'test ! -e /usr/local/bin/npm',
      'test ! -e /usr/local/bin/npx',
      `test -z "$(find ${definition.workdir} -path '*/node_modules/*' -prune -o -type f -name '*.map' -print -quit)"`,
      ...definition.required.map((file) => `test -f ${file}`),
      ...(definition.requiredCommands ?? []).map((command) => `command -v ${command} >/dev/null`),
      ...(definition.forbiddenCommands ?? []).map(
        (command) => `! command -v ${command} >/dev/null`,
      ),
      ...definition.required
        .filter((file) => file.endsWith('.mjs') || file.endsWith('.js'))
        .map((file) => `node --check ${file} >/dev/null`),
    ];
    await docker(['run', '--rm', '--entrypoint', 'sh', definition.image, '-c', checks.join('\n')]);
    results.push({
      name: definition.name,
      image: definition.image,
      imageId: inspection.Id,
      scope: definition.testOnly ? 'ephemeral_test_only' : 'production',
      nonRoot: true,
      compiledJavaScript: true,
      buildToolingAbsent: true,
      sourceMapsAbsent: true,
      nativeOcrRuntime: Boolean(definition.requiredCommands),
    });
  }
  console.log(JSON.stringify({ status: 'passed', images: results }, null, 2));
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      errorCode: 'PRODUCTION_IMAGE_CONTENT_VALIDATION_FAILED',
      message: error instanceof Error ? error.message : 'Image validation failed.',
    }),
  );
  process.exitCode = 1;
});
