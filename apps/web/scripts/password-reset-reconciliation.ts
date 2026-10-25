import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

export const PASSWORD_RESET_MIGRATION = '20260930130000_password_reset_tokens';

function runPrisma(
  repositoryRoot: string,
  arguments_: string[],
  environment: NodeJS.ProcessEnv,
  cwd: string,
) {
  const prismaCli = createRequire(
    path.join(repositoryRoot, 'packages', 'database', 'package.json'),
  ).resolve('prisma/build/index.js');
  return spawnSync(process.execPath, [prismaCli, ...arguments_], {
    cwd,
    env: environment,
    encoding: 'utf8',
  });
}

/**
 * Databases built from the historical account baseline already contain "PasswordResetToken".
 * Records its migration only when the existing table matches it exactly (see
 * packages/database/prisma/reconciliation) and fails closed otherwise. Mirrors
 * docker/run-staging-migrations.sh.
 */
export function reconcilePasswordResetTokens(options: {
  repositoryRoot: string;
  schema: string;
  environment: NodeJS.ProcessEnv;
  cwd?: string;
}) {
  const cwd = options.cwd ?? options.repositoryRoot;
  const check = path.join(
    options.repositoryRoot,
    'packages',
    'database',
    'prisma',
    'reconciliation',
    `${PASSWORD_RESET_MIGRATION}.sql`,
  );
  const checkResult = runPrisma(
    options.repositoryRoot,
    ['db', 'execute', '--file', check, '--schema', options.schema],
    options.environment,
    cwd,
  );
  const checkOutput = `${checkResult.stdout ?? ''}${checkResult.stderr ?? ''}`;
  if (checkResult.status !== 0) {
    if (checkOutput.includes('AVANTIME_RECONCILE_NOT_REQUIRED')) return 'not_required' as const;
    throw new Error(`PasswordResetToken reconciliation check failed:\n${checkOutput}`);
  }
  const resolveResult = runPrisma(
    options.repositoryRoot,
    ['migrate', 'resolve', '--applied', PASSWORD_RESET_MIGRATION, '--schema', options.schema],
    options.environment,
    cwd,
  );
  if (resolveResult.status !== 0) {
    throw new Error(
      `PasswordResetToken migration could not be recorded:\n${resolveResult.stdout ?? ''}${resolveResult.stderr ?? ''}`,
    );
  }
  return 'reconciled' as const;
}
