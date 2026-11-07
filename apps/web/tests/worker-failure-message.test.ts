import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { redactUrlPasswords, workerFailureMessage } from '../lib/worker-failure-message';

test('URL passwords are masked and the rest of the message is kept', () => {
  assert.equal(
    redactUrlPasswords(
      'connect failed: postgresql://avantime:s3cr3t@db.internal:5432/avantime and rediss://:t0ken@cache:6380/0',
    ),
    'connect failed: postgresql://avantime:***@db.internal:5432/avantime and rediss://:***@cache:6380/0',
  );
  assert.equal(
    redactUrlPasswords('redis://worker:p@ss:w0rd@cache:6379'),
    'redis://worker:***@cache:6379',
  );
  assert.equal(
    redactUrlPasswords('postgres://db.internal:5432/avantime has no credentials'),
    'postgres://db.internal:5432/avantime has no credentials',
  );
});

test('worker failure message masks passwords and falls back for non-errors', () => {
  assert.equal(
    workerFailureMessage('Document worker', new Error('Redis redis://:secret@cache:6379 refused')),
    'Document worker failed: Redis redis://:***@cache:6379 refused',
  );
  assert.equal(workerFailureMessage('Document worker', 'boom'), 'Document worker failed.');
});

test('document embedding worker prints the cause of a fatal failure', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/run-document-embedding-worker.ts'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production', DOCUMENT_WORKER_TENANT_ID: '' },
    },
  );

  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /Document embedding worker failed: DOCUMENT_WORKER_TENANT_ID is required for the selected document configuration\./u,
  );
});
