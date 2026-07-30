import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { sanitizePlaywrightArtifacts } from '../scripts/sanitize-playwright-artifacts';

test('Playwright traces redact header pairs, session cookies and browser credentials', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'avantime-browser-trace-'));
  const resultDirectory = path.join(directory, 'result');
  const tracePath = path.join(resultDirectory, 'trace.zip');
  await mkdir(resultDirectory);

  const unsafeLine = JSON.stringify({
    headers: [
      { name: 'Authorization', value: 'Bearer browser-token-value' },
      { name: 'Cookie', value: 'avantime_session=browser-cookie-value' },
    ],
    cookies: [{ name: 'avantime_session', value: 'browser-cookie-value' }],
    password: 'browser-user-a-password',
    url: 'http://127.0.0.1:3410/portal',
  });
  await writeFile(
    tracePath,
    zipSync({
      '0-network.network': strToU8(`${unsafeLine}\n`),
      'safe-resource.txt': strToU8('safe resource'),
    }),
  );

  try {
    await sanitizePlaywrightArtifacts(directory);
    const archive = unzipSync(new Uint8Array(await readFile(tracePath)));
    const network = strFromU8(archive['0-network.network']);
    assert.doesNotMatch(
      network,
      /browser-token-value|browser-cookie-value|browser-user-a-password/,
    );
    assert.match(network, /\[REDACTED\]/);
    assert.equal(strFromU8(archive['safe-resource.txt']), 'safe resource');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
