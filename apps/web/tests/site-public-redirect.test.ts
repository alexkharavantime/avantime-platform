import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { oidcCallbackUri, OidcValidationError } from '../lib/oidc';
import { isSitePath, sitePublicUrl } from '../lib/site-public-origin';
import { sitePublicRedirect } from '../lib/site-public-redirect';

const staging = {
  NODE_ENV: 'production',
  APP_ENV: 'staging',
  AUTH_PUBLIC_ORIGIN: 'https://site.avantime.localhost',
};

test('site redirects use the checked public origin, never the listen address', () => {
  assert.equal(
    sitePublicUrl('/ru/portal/login?oidcError=provider_unavailable', staging),
    'https://site.avantime.localhost/ru/portal/login?oidcError=provider_unavailable',
  );
  assert.equal(
    sitePublicUrl('/portal/login', {
      NODE_ENV: 'production',
      AUTH_PUBLIC_ORIGIN: 'https://www.avantime.lv',
    }),
    'https://www.avantime.lv/portal/login',
  );
  assert.equal(
    sitePublicUrl('/lv/portal/login', {
      NODE_ENV: 'development',
      AUTH_PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
    }),
    'http://127.0.0.1:3000/lv/portal/login',
  );
});

test('without an accepted public origin the redirect stays a same-site relative path', () => {
  for (const environment of [
    { NODE_ENV: 'development' },
    // The local staging template uses http://web:3000, which production mode rejects.
    { NODE_ENV: 'production', APP_ENV: 'staging', AUTH_PUBLIC_ORIGIN: 'http://web:3000' },
  ]) {
    assert.equal(sitePublicUrl('/en/portal/login', environment), '/en/portal/login');
  }
});

test('only same-site paths can become redirect targets', () => {
  for (const value of ['/portal', '/ru/portal/login?returnTo=%2Fportal', '/']) {
    assert.equal(isSitePath(value), true, value);
  }
  for (const value of [
    '//evil.example/portal',
    '/\\evil.example',
    'https://evil.example/portal',
    'evil.example',
    '/portal\\..\\x',
    '/portal login',
    '',
  ]) {
    assert.equal(isSitePath(value), false, value);
    assert.throws(() => sitePublicUrl(value, staging), /SITE_PATH_INVALID/u);
  }
});

test('the redirect response carries only the public location and a See Other status', () => {
  const previous = { ...process.env };
  Object.assign(process.env, staging);
  try {
    const response = sitePublicRedirect('/ru/portal/login');
    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get('location'),
      'https://site.avantime.localhost/ru/portal/login',
    );
    assert.equal(sitePublicRedirect('/admin/knowledge', 307).status, 307);
  } finally {
    for (const key of Object.keys(staging)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('the OIDC callback is on the public origin and unavailable without one', () => {
  assert.equal(oidcCallbackUri(staging), 'https://site.avantime.localhost/api/auth/oidc/callback');
  assert.throws(
    () => oidcCallbackUri({ NODE_ENV: 'production', APP_ENV: 'staging' }),
    (error: unknown) =>
      error instanceof OidcValidationError && error.code === 'PUBLIC_ORIGIN_UNAVAILABLE',
  );
});

test('API routes never build redirects from the request URL', async () => {
  const root = fileURLToPath(new URL('../app/api/', import.meta.url));
  const routes = (await readdir(root, { recursive: true })).filter((file) =>
    file.endsWith('route.ts'),
  );
  assert.ok(routes.length > 20);
  for (const route of routes) {
    const source = await readFile(path.join(root, route), 'utf8');
    assert.doesNotMatch(source, /new URL\([^)]*,\s*request\.url\s*\)/u, route);
    // Redirects to an external provider (an absolute URL it issued) remain NextResponse.redirect.
    assert.doesNotMatch(source, /NextResponse\.redirect\(\s*new URL\(/u, route);
  }
});
