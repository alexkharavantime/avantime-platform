import assert from 'node:assert/strict';
import test from 'node:test';

import { pgRestoreArguments } from '../lib/backup-restore';

test('restore rehearsal restores into the isolated target database, not to stdout', () => {
  const args = pgRestoreArguments(
    'avantime_restore_rehearsal',
    '/tmp/avantime-restore-x/archive.dump',
  );
  // Without --dbname (or --file) pg_restore refuses to run: PGDATABASE is not a restore target.
  assert.deepEqual(args.slice(0, 2), ['--dbname', 'avantime_restore_rehearsal']);
  assert.ok(args.includes('--exit-on-error'));
  assert.ok(args.includes('--clean') && args.includes('--if-exists'));
  assert.ok(args.includes('--no-owner') && args.includes('--no-acl'));
  assert.equal(args.at(-1), '/tmp/avantime-restore-x/archive.dump');
});
