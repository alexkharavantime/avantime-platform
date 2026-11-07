import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const scripts = [
  ['scripts/cleanup-deleted-documents.ts', /Document cleanup requires --tenant=<companyId>\./],
  ['scripts/migrate-documents.ts', /Document migration requires --tenant=<companyId>\./],
] as const;

for (const [script, message] of scripts) {
  test(`${path.basename(script)} refuses to run without an explicit --tenant`, () => {
    for (const args of [['--dry-run'], ['--tenant=', '--dry-run']]) {
      const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, CLEANUP_TENANT_ID: 'avantime', MIGRATION_TENANT_ID: 'avantime' },
      });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, message);
    }
  });
}
