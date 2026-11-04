import assert from 'node:assert/strict';
import test from 'node:test';

import { checkSitePublicOrigin, sitePublicOrigin } from '../lib/site-public-origin';

const production = { NODE_ENV: 'production' };
const staging = { NODE_ENV: 'production', APP_ENV: 'staging' };

test('production accepts only a public HTTPS origin that is not a staging host', () => {
  assert.equal(
    checkSitePublicOrigin({ ...production, AUTH_PUBLIC_ORIGIN: 'https://www.avantime.lv/' }).origin
      ?.href,
    'https://www.avantime.lv/',
  );
  for (const [origin, problem] of [
    [undefined, 'missing'],
    ['not a url', 'invalid'],
    ['https://www.avantime.lv/ru', 'not_origin'],
    ['https://www.avantime.lv/?a=1', 'not_origin'],
    ['https://user:pass@www.avantime.lv', 'not_origin'],
    ['http://www.avantime.lv', 'not_https'],
    ['https://localhost', 'local_host'],
    ['https://site.avantime.localhost', 'local_host'],
    ['https://127.0.0.1', 'local_host'],
    ['https://[::1]', 'local_host'],
    ['https://web:3000', 'local_host'],
    ['https://staging.avantime.lv', 'staging_host'],
    ['https://portal-staging.avantime.lv', 'staging_host'],
  ] as const) {
    assert.equal(
      checkSitePublicOrigin({ ...production, AUTH_PUBLIC_ORIGIN: origin }).problem,
      problem,
      String(origin),
    );
  }
});

test('staging accepts its own HTTPS host and development also accepts HTTP', () => {
  assert.equal(
    checkSitePublicOrigin({ ...staging, AUTH_PUBLIC_ORIGIN: 'https://site.avantime.localhost' })
      .origin?.origin,
    'https://site.avantime.localhost',
  );
  assert.equal(
    checkSitePublicOrigin({ ...staging, AUTH_PUBLIC_ORIGIN: 'http://web:3000' }).problem,
    'not_https',
  );
  assert.equal(
    checkSitePublicOrigin({ NODE_ENV: 'development', AUTH_PUBLIC_ORIGIN: 'http://127.0.0.1:3000' })
      .origin?.origin,
    'http://127.0.0.1:3000',
  );
});

test('a rejected origin yields relative URLs instead of a guessed host', () => {
  const warn = console.warn;
  const logged: string[] = [];
  console.warn = (message: string) => logged.push(message);
  try {
    assert.equal(
      sitePublicOrigin({ ...production, AUTH_PUBLIC_ORIGIN: 'https://localhost' }),
      null,
    );
    assert.equal(sitePublicOrigin({ ...production }), null);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(
    logged.map((line) => JSON.parse(line)),
    [
      { event: 'site.public_origin.rejected', reason: 'local_host' },
      { event: 'site.public_origin.rejected', reason: 'missing' },
    ],
  );
});
