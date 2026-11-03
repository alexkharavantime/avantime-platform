import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  createBrowserTestClientIp,
  type BrowserTestClientIdentity,
} from './browser/test-client-ip';
import { loginIdentifierRateLimitSubject, requestRateLimitSubject } from '../lib/identity-route';

const webDirectory = process.cwd();

const baseIdentity: BrowserTestClientIdentity = {
  project: 'chromium-tablet',
  file: 'tests/browser/responsive.spec.ts',
  titlePath: ['@responsive portal layouts', 'overflow'],
  retry: 0,
  repeatEachIndex: 0,
  workerIndex: 0,
  parallelIndex: 0,
  shard: '1/2',
  run: '123:1',
};

test('browser test client IP is deterministic and collision-resistant across execution dimensions', () => {
  const baseline = createBrowserTestClientIp(baseIdentity);
  assert.equal(createBrowserTestClientIp(baseIdentity), baseline);
  assert.match(baseline, /^2001:db8(?::[a-f0-9]{1,4}){5}:1$/u);

  for (const identity of [
    { ...baseIdentity, project: 'chromium-mobile' },
    { ...baseIdentity, file: 'tests/browser/other.spec.ts' },
    { ...baseIdentity, retry: 1 },
    { ...baseIdentity, repeatEachIndex: 1 },
    { ...baseIdentity, workerIndex: 1 },
    { ...baseIdentity, parallelIndex: 1 },
    { ...baseIdentity, shard: '2/2' },
    { ...baseIdentity, run: '123:2' },
  ]) {
    assert.notEqual(createBrowserTestClientIp(identity), baseline);
  }
});

test('browser-only identifier isolation uses the forwarded test client IP without changing production', () => {
  const request = new Request('http://127.0.0.1:3410/api/auth/login', {
    headers: { 'x-forwarded-for': '2001:db8:1:2:3:4:5:1, 127.0.0.1' },
  });
  assert.equal(requestRateLimitSubject(request), '2001:db8:1:2:3:4:5:1');
  assert.equal(
    loginIdentifierRateLimitSubject(request, 'user@example.test', {
      NODE_ENV: 'test',
      IDENTITY_TEST_MODE: 'browser',
    }),
    `user@example.test\0${'2001:db8:1:2:3:4:5:1'}`,
  );
  assert.equal(
    loginIdentifierRateLimitSubject(request, 'user@example.test', {
      NODE_ENV: 'production',
      IDENTITY_TEST_MODE: 'browser',
    }),
    'user@example.test',
  );
  assert.equal(
    loginIdentifierRateLimitSubject(request, 'user@example.test', {
      NODE_ENV: 'test',
    }),
    'user@example.test',
  );
});

test('route retention for browser tests never reaches a production build or server', () => {
  const nextConfigOnDemandEntries = (environment: Record<string, string>) => {
    const { stdout } = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "const loaded = await import('./next.config.ts'); const config = loaded.default.default ?? loaded.default; process.stdout.write(JSON.stringify(config.onDemandEntries ?? null));",
      ],
      { cwd: webDirectory, env: { ...process.env, ...environment }, encoding: 'utf8' },
    );
    return JSON.parse(stdout) as unknown;
  };
  assert.deepEqual(
    nextConfigOnDemandEntries({ NODE_ENV: 'test', NEXT_KEEP_COMPILED_ROUTES: 'true' }),
    { maxInactiveAge: 24 * 60 * 60 * 1000, pagesBufferLength: 1000 },
  );
  assert.equal(
    nextConfigOnDemandEntries({ NODE_ENV: 'production', NEXT_KEEP_COMPILED_ROUTES: 'true' }),
    null,
  );
  assert.equal(
    nextConfigOnDemandEntries({ NODE_ENV: 'test', NEXT_KEEP_COMPILED_ROUTES: '' }),
    null,
  );
});
