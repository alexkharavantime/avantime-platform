import { createHash } from 'node:crypto';

export type BrowserTestClientIdentity = {
  project: string;
  file: string;
  titlePath: string[];
  retry: number;
  repeatEachIndex: number;
  workerIndex: number;
  parallelIndex: number;
  shard: string;
  run: string;
};

export function createBrowserTestClientIp(identity: BrowserTestClientIdentity) {
  const hash = createHash('sha256')
    .update(
      [
        identity.project,
        identity.file,
        ...identity.titlePath,
        String(identity.retry),
        String(identity.repeatEachIndex),
        String(identity.workerIndex),
        String(identity.parallelIndex),
        identity.shard,
        identity.run,
      ].join('\0'),
    )
    .digest('hex');

  return `2001:db8:${hash.slice(0, 4)}:${hash.slice(4, 8)}:${hash.slice(8, 12)}:${hash.slice(12, 16)}:${hash.slice(16, 20)}:1`;
}

export function browserTestShard(environment: NodeJS.ProcessEnv = process.env) {
  return environment.PLAYWRIGHT_SHARD ?? environment.CI_NODE_INDEX ?? 'unsharded';
}

export function browserTestRun(environment: NodeJS.ProcessEnv = process.env) {
  return [
    environment.GITHUB_RUN_ID ?? 'local',
    environment.GITHUB_RUN_ATTEMPT ?? '1',
  ].join(':');
}
