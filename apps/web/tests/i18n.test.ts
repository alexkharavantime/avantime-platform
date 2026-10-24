import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { localePath, resolveLocale } from '../lib/i18n';
import { middleware } from '../middleware';

test('explicit locale prefix overrides saved and browser preferences', () => {
  assert.equal(resolveLocale('/ru/admin', 'en', 'lv-LV,ru;q=0.8'), 'ru');
});

test('saved locale overrides browser preference on unprefixed routes', () => {
  assert.equal(resolveLocale('/portal/login', 'ru', 'en-US,en;q=0.9'), 'ru');
});

test('browser language is used only when no explicit or saved locale exists', () => {
  assert.equal(resolveLocale('/portal/login', undefined, 'en-US,en;q=0.9,ru;q=0.7'), 'en');
  assert.equal(resolveLocale('/portal/login', undefined, 'de-DE,de;q=0.9'), 'lv');
});

test('localePath replaces an existing prefix and retains query and fragment', () => {
  assert.equal(localePath('ru', '/en/admin?status=open#queue'), '/ru/admin?status=open#queue');
  assert.equal(localePath('en', '/'), '/en');
});

test('protected route redirects through the configured auth origin', () => {
  const originalOrigin = process.env.AUTH_PUBLIC_ORIGIN;
  process.env.AUTH_PUBLIC_ORIGIN = 'http://127.0.0.1:3000';
  try {
    const response = middleware(
      new NextRequest('http://localhost:3000/ru/portal/platform/access-requests'),
    );
    assert.equal(
      response.headers.get('location'),
      'http://127.0.0.1:3000/ru/portal/login?returnTo=%2Fru%2Fportal%2Fplatform%2Faccess-requests',
    );
  } finally {
    if (originalOrigin === undefined) delete process.env.AUTH_PUBLIC_ORIGIN;
    else process.env.AUTH_PUBLIC_ORIGIN = originalOrigin;
  }
});