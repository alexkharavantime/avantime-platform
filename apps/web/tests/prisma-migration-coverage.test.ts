import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryRoot = new URL('../../..', import.meta.url);

async function repositoryFile(path: string) {
  return readFile(new URL(path, repositoryRoot), 'utf8');
}

// `prisma db push` and the browser fixture (which pushes the schema after the migrations) hide
// models that no migration creates; a database built by the deployment path then lacks them.
test('every Prisma model and enum is created by the migrations or the historical baseline', async () => {
  const schema = await repositoryFile('packages/database/prisma/schema.prisma');
  const migrations = (
    await readdir(new URL('packages/database/prisma/migrations/', repositoryRoot), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/database/prisma/migrations/${entry.name}/migration.sql`);
  const sql = (
    await Promise.all(
      ['packages/database/prisma/staging-empty-database-baseline.sql', ...migrations].map(
        repositoryFile,
      ),
    )
  ).join('\n');

  const declared = (keyword: string) =>
    [...schema.matchAll(new RegExp(`^${keyword} (\\w+) \\{`, 'gmu'))].map((match) => match[1]);
  const created = (statement: string) =>
    new Set(
      [...sql.matchAll(new RegExp(`${statement} (?:IF NOT EXISTS )?"(\\w+)"`, 'gu'))].map(
        (match) => match[1],
      ),
    );

  const tables = created('CREATE TABLE');
  const types = created('CREATE TYPE');
  assert.deepEqual(
    declared('model').filter((model) => !tables.has(model)),
    [],
    'models without a CREATE TABLE in any migration',
  );
  assert.deepEqual(
    declared('enum').filter((name) => !types.has(name)),
    [],
    'enums without a CREATE TYPE in any migration',
  );
});
