import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  getRepositoryRoot,
  resolveIntegrationCommand,
  runIntegrationCommand,
} from '../scripts/document-integration-environment';

const repositoryRoot = getRepositoryRoot();

test('npx commands run the package bin through the current Node, without a shell', () => {
  const prisma = resolveIntegrationCommand(
    'npx',
    ['prisma', 'migrate', 'deploy', '--schema', 'C:\\Users\\Some One\\schema.prisma'],
    repositoryRoot,
  );
  assert.equal(prisma.command, process.execPath);
  assert.ok(existsSync(prisma.arguments_[0]!), prisma.arguments_[0]);
  assert.match(prisma.arguments_[0]!, /prisma[\\/]build[\\/]index\.js$/u);
  assert.deepEqual(prisma.arguments_.slice(1), [
    'migrate',
    'deploy',
    '--schema',
    'C:\\Users\\Some One\\schema.prisma',
  ]);

  const tsx = resolveIntegrationCommand('npx', ['tsx', '--test', 'a.test.ts'], repositoryRoot);
  assert.equal(tsx.command, process.execPath);
  assert.ok(existsSync(tsx.arguments_[0]!));
  assert.equal(path.basename(path.dirname(path.dirname(tsx.arguments_[0]!))), 'tsx');
  assert.deepEqual(tsx.arguments_.slice(1), ['--test', 'a.test.ts']);
});

test('node commands use the current Node executable and other commands pass through', () => {
  assert.deepEqual(resolveIntegrationCommand('node', ['--version'], repositoryRoot), {
    command: process.execPath,
    arguments_: ['--version'],
  });
  assert.deepEqual(resolveIntegrationCommand('docker', ['ps'], repositoryRoot), {
    command: 'docker',
    arguments_: ['ps'],
  });
});

test('a missing npx package fails with a clear message', () => {
  assert.throws(
    () => resolveIntegrationCommand('npx', ['avantime-no-such-package'], repositoryRoot),
    /package "avantime-no-such-package" is not installed/u,
  );
});

test('a command that cannot start rejects with its name and the error code', async () => {
  await assert.rejects(
    runIntegrationCommand('avantime-no-such-command', ['--flag'], {
      cwd: repositoryRoot,
      environment: process.env,
    }),
    /Integration command "avantime-no-such-command --flag" could not start: ENOENT\./u,
  );
});

test('a resolved npx command actually runs', async () => {
  await runIntegrationCommand('npx', ['prisma', '--version'], {
    cwd: repositoryRoot,
    environment: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
});
