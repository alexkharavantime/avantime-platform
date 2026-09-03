import { spawn, spawnSync } from 'node:child_process';

import { isImmutableGitCommitSha } from '../lib/artifact-metadata';

export function resolveRepositoryCommitSha() {
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
    encoding: 'utf8',
    shell: false,
  });
  const commitSha = result.stdout.trim();
  if (result.status !== 0 || !isImmutableGitCommitSha(commitSha)) {
    throw new Error('LOCAL_STAGING_COMMIT_SHA_UNAVAILABLE');
  }
  return commitSha;
}

async function main() {
  const [executable, ...arguments_] = process.argv.slice(2);
  if (!executable) throw new Error('LOCAL_STAGING_COMMAND_REQUIRED');
  const commitSha = resolveRepositoryCommitSha();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, arguments_, {
      env: { ...process.env, COMMIT_SHA: commitSha },
      shell: false,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`LOCAL_STAGING_COMMAND_FAILED:${code ?? signal ?? 'unknown'}`));
    });
  });
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      errorCode: error instanceof Error ? error.message : 'LOCAL_STAGING_COMMAND_FAILED',
    }),
  );
  process.exitCode = 1;
});
