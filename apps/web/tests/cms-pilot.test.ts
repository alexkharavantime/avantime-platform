import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { loadCmsConfiguration, type CmsConfiguration } from '../lib/cms-configuration';
import {
  cmsProductPageKeyForSlug,
  cmsProductPagePath,
  cmsProductPageTag,
} from '../lib/cms-product-page-routes';
import { signCmsPreview, verifyCmsBearer, verifyCmsPreviewRequest } from '../lib/cms-preview-token';
import {
  CmsUnavailableError,
  lookupDraftCmsProductPage,
  lookupPublishedCmsProductPage,
  parseCmsProductPage,
  parseCmsRevalidateRequest,
  readCmsSnapshot,
  resolveCmsProductPage,
  writeCmsSnapshot,
  type CmsProductPage,
  type CmsPublishedLookup,
} from '../lib/cms-product-pages';
import { warmCmsProductPages } from '../lib/cms-warmup';
import { middleware } from '../middleware';

const secret = 'p'.repeat(48);
const environment = {
  CMS_PILOT_MODE: 'on',
  CMS_URL: 'http://cms.internal:1337',
  CMS_MEDIA_URL: 'https://media.avantime.test',
  CMS_API_TOKEN: 't'.repeat(64),
  CMS_PREVIEW_SECRET: secret,
  CMS_REVALIDATE_SECRET: 'r'.repeat(48),
  CMS_SNAPSHOT_DIR: '.data/cms-snapshots-test',
};
const configuration = loadCmsConfiguration(environment) as Extract<
  CmsConfiguration,
  { enabled: true }
>;

function entry(overrides: Record<string, unknown> = {}) {
  return {
    key: 'accounting',
    locale: 'ru',
    name: 'Бухгалтерия предприятия',
    lead: 'Лид',
    imageAlt: 'Иллюстрация',
    image: { url: '/uploads/accounting.webp' },
    benefits: [{ title: 'Документы', text: 'Текст' }],
    approachTitle: 'Подход',
    approachText: 'Описание подхода',
    ctaText: 'Призыв',
    ctaButton: 'Кнопка',
    seo: { metaTitle: 'SEO title', metaDescription: null, noIndex: false },
    ...overrides,
  };
}

function cmsFetch(responses: Record<'published' | 'draft', unknown[] | number>, seen: URL[] = []) {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push(url);
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      `Bearer ${environment.CMS_API_TOKEN}`,
    );
    const response = responses[url.searchParams.get('status') as 'published' | 'draft'];
    if (typeof response === 'number') return new Response('{}', { status: response });
    return Response.json({ data: response });
  }) as typeof fetch;
}

test('CMS pilot is off unless explicitly enabled and validates its configuration', () => {
  assert.deepEqual(loadCmsConfiguration({}), { enabled: false });
  assert.deepEqual(loadCmsConfiguration({ CMS_PILOT_MODE: 'off', CMS_URL: 'not a url' }), {
    enabled: false,
  });
  assert.throws(() => loadCmsConfiguration({ CMS_PILOT_MODE: 'yes' }), /CMS_PILOT_MODE_INVALID/);
  assert.throws(
    () => loadCmsConfiguration({ ...environment, CMS_API_TOKEN: '' }),
    /CMS_API_TOKEN_REQUIRED/,
  );
  assert.throws(
    () => loadCmsConfiguration({ ...environment, CMS_PREVIEW_SECRET: 'short' }),
    /TOO_SHORT/,
  );
  assert.throws(
    () =>
      loadCmsConfiguration({
        ...environment,
        CMS_REVALIDATE_SECRET: '<replace-with-secret-value-here>',
      }),
    /PLACEHOLDER/,
  );
  assert.throws(
    () => loadCmsConfiguration({ ...environment, CMS_URL: 'http://cms/api' }),
    /CMS_URL_INVALID/,
  );
  assert.throws(
    () => loadCmsConfiguration({ ...environment, CMS_URL: 'ftp://cms' }),
    /CMS_URL_INVALID/,
  );
  assert.equal(configuration.url, 'http://cms.internal:1337');
  assert.equal(configuration.timeoutMs, 3000);
  assert.equal(configuration.maxStaleSeconds, 86400);
  assert.throws(
    () =>
      loadCmsConfiguration({
        ...environment,
        CMS_CACHE_SECONDS: '3600',
        CMS_MAX_STALE_SECONDS: '600',
      }),
    /CMS_MAX_STALE_SECONDS_INVALID/,
  );
  assert.ok(path.isAbsolute(configuration.snapshotDirectory));
});

test('product page routes are a fixed allow-list', () => {
  assert.equal(cmsProductPageKeyForSlug('buhgalteriya-predpriyatiya'), 'accounting');
  assert.equal(cmsProductPageKeyForSlug('adresny-sklad'), null);
  assert.equal(cmsProductPagePath('accounting', 'ru'), '/ru/solutions/buhgalteriya-predpriyatiya');
  assert.equal(cmsProductPageTag('accounting', 'lv'), 'cms:product-page:accounting:lv');
});

test('preview links are accepted only with a valid, unexpired signature for an allow-listed page', () => {
  const now = 1_800_000_000;
  const request = {
    type: 'product-page',
    key: 'accounting',
    locale: 'lv',
    status: 'draft',
    expiresAt: now + 900,
  } as const;
  const sig = signCmsPreview(secret, request);
  const params = (overrides: Record<string, string> = {}) =>
    new URLSearchParams({
      type: 'product-page',
      key: 'accounting',
      locale: 'lv',
      status: 'draft',
      exp: String(now + 900),
      sig,
      ...overrides,
    });

  // Same algorithm as cms/src/site-integration.ts in the CMS project.
  const independent = createHmac('sha256', secret)
    .update(`v1|product-page|accounting|lv|draft|${now + 900}`)
    .digest('base64url');
  assert.equal(sig, independent);

  assert.deepEqual(verifyCmsPreviewRequest(secret, params(), now), request);
  assert.equal(verifyCmsPreviewRequest('x'.repeat(48), params(), now), null);
  assert.equal(verifyCmsPreviewRequest(secret, params({ locale: 'ru' }), now), null);
  assert.equal(verifyCmsPreviewRequest(secret, params({ status: 'published' }), now), null);
  assert.equal(verifyCmsPreviewRequest(secret, params({ sig: `${sig}x` }), now), null);
  assert.equal(verifyCmsPreviewRequest(secret, params(), now + 901), null);
  assert.equal(verifyCmsPreviewRequest(secret, params({ key: '../../admin' }), now), null);
  assert.equal(verifyCmsPreviewRequest(secret, params({ locale: 'de' }), now), null);

  const farFuture = { ...request, expiresAt: now + 7200 };
  const farParams = params({
    exp: String(farFuture.expiresAt),
    sig: signCmsPreview(secret, farFuture),
  });
  assert.equal(verifyCmsPreviewRequest(secret, farParams, now), null);
});

test('revalidation requires the exact bearer secret and an allow-listed payload', () => {
  assert.equal(verifyCmsBearer(secret, `Bearer ${secret}`), true);
  assert.equal(verifyCmsBearer(secret, `Bearer ${secret}x`), false);
  assert.equal(verifyCmsBearer(secret, secret), false);
  assert.equal(verifyCmsBearer(secret, null), false);

  assert.deepEqual(
    parseCmsRevalidateRequest({
      model: 'product-page',
      key: 'accounting',
      locales: ['lv', 'lv', 'ru'],
      action: 'publish',
    }),
    { key: 'accounting', locales: ['lv', 'ru'], action: 'publish' },
  );
  for (const invalid of [
    { model: 'page', key: 'accounting', locales: ['lv'], action: 'publish' },
    { model: 'product-page', key: 'knowledge', locales: ['lv'], action: 'publish' },
    { model: 'product-page', key: 'accounting', locales: ['de'], action: 'publish' },
    { model: 'product-page', key: 'accounting', locales: [], action: 'publish' },
    { model: 'product-page', key: 'accounting', locales: ['lv'], action: 'update' },
    { model: 'product-page', key: 'constructor', locales: ['lv'], action: 'publish' },
    null,
  ]) {
    assert.equal(parseCmsRevalidateRequest(invalid), null);
  }
});

test('CMS entries are parsed strictly and media must come from the configured origin', () => {
  const page = parseCmsProductPage(entry(), { key: 'accounting', locale: 'ru' }, configuration);
  assert.equal(page.image.url, 'https://media.avantime.test/uploads/accounting.webp');
  assert.deepEqual(page.seo, { title: 'SEO title', description: null, noIndex: false });
  assert.throws(
    () =>
      parseCmsProductPage(
        entry({ image: { url: 'https://evil.test/uploads/a.webp' } }),
        { key: 'accounting', locale: 'ru' },
        configuration,
      ),
    /CMS_FIELD_IMAGE_URL_INVALID/,
  );
  assert.throws(
    () => parseCmsProductPage(entry(), { key: 'accounting', locale: 'lv' }, configuration),
    /CMS_ENTRY_MISMATCH/,
  );
  assert.throws(
    () =>
      parseCmsProductPage(
        entry({ benefits: [] }),
        { key: 'accounting', locale: 'ru' },
        configuration,
      ),
    /BENEFITS/,
  );
});

test('published lookup distinguishes published, unpublished, missing and unavailable states', async () => {
  const seen: URL[] = [];
  const before = Date.now();
  const published = await lookupPublishedCmsProductPage(
    configuration,
    'accounting',
    'ru',
    cmsFetch({ published: [entry()], draft: [] }, seen),
  );
  assert.equal(published.state, 'published');
  assert.ok(Date.parse(published.checkedAt) >= before - 1000);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].searchParams.get('filters[key][$eq]'), 'accounting');
  assert.equal(seen[0].searchParams.get('locale'), 'ru');

  const withoutTime = (lookup: CmsPublishedLookup) => {
    const rest: Partial<CmsPublishedLookup> = { ...lookup };
    delete rest.checkedAt;
    return rest;
  };
  assert.deepEqual(
    withoutTime(
      await lookupPublishedCmsProductPage(
        configuration,
        'accounting',
        'ru',
        cmsFetch({ published: [], draft: [entry()] }),
      ),
    ),
    { state: 'withdrawn', reason: 'unpublished' },
  );
  assert.deepEqual(
    withoutTime(
      await lookupPublishedCmsProductPage(
        configuration,
        'accounting',
        'ru',
        cmsFetch({ published: [], draft: [] }),
      ),
    ),
    { state: 'withdrawn', reason: 'missing' },
  );
  await assert.rejects(
    lookupPublishedCmsProductPage(
      configuration,
      'accounting',
      'ru',
      cmsFetch({ published: 503, draft: [] }),
    ),
    (error: unknown) => error instanceof CmsUnavailableError && error.code === 'CMS_HTTP_503',
  );
  await assert.rejects(
    lookupPublishedCmsProductPage(
      configuration,
      'accounting',
      'ru',
      cmsFetch({ published: [entry(), entry()], draft: [] }),
    ),
    /CMS_DUPLICATE_KEY/,
  );
  const draft = await lookupDraftCmsProductPage(
    configuration,
    'accounting',
    'ru',
    cmsFetch({ published: [], draft: [entry({ name: 'Черновик' })] }),
  );
  assert.equal(draft?.name, 'Черновик');
});

test('resolution keeps disabled, live, draft, withdrawn and outage states apart', async () => {
  const page = parseCmsProductPage(entry(), { key: 'accounting', locale: 'ru' }, configuration);
  const input = { key: 'accounting', locale: 'ru', draft: false } as const;
  const failing = async () => {
    throw new CmsUnavailableError('CMS_NETWORK_ERROR');
  };
  const now = Date.parse('2026-11-03T12:00:00.000Z');
  const checkedAt = '2026-11-03T11:00:00.000Z';
  const base = {
    configuration,
    publishedLookup: async () => ({ state: 'published' as const, page, checkedAt }),
    draftLookup: async () => ({ ...page, name: 'Черновик' }) as CmsProductPage,
    readSnapshot: async (): Promise<CmsPublishedLookup | null> => null,
    now: () => now,
  };
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    assert.deepEqual(
      await resolveCmsProductPage(input, { ...base, configuration: { enabled: false } }),
      {
        source: 'repository',
        reason: 'disabled',
      },
    );
    assert.deepEqual(await resolveCmsProductPage(input, base), {
      source: 'cms',
      page,
      draft: false,
      stale: false,
    });

    const draft = await resolveCmsProductPage(
      { ...input, draft: true },
      { ...base, publishedLookup: failing },
    );
    assert.equal(draft.source === 'cms' && draft.draft && draft.page.name, 'Черновик');

    assert.deepEqual(
      await resolveCmsProductPage(input, {
        ...base,
        publishedLookup: async () => ({ state: 'withdrawn', reason: 'unpublished', checkedAt }),
      }),
      { source: 'withdrawn', reason: 'unpublished', stale: false },
    );
    // Without a snapshot the outage state is unknown: repository content could resurrect a withdrawn page.
    assert.deepEqual(await resolveCmsProductPage(input, { ...base, publishedLookup: failing }), {
      source: 'unavailable',
      code: 'CMS_NETWORK_ERROR',
    });
    assert.deepEqual(
      await resolveCmsProductPage(input, {
        ...base,
        publishedLookup: failing,
        readSnapshot: async () => ({ state: 'published', page, checkedAt }),
      }),
      { source: 'cms', page, draft: false, stale: true },
    );
    assert.deepEqual(
      await resolveCmsProductPage(input, {
        ...base,
        publishedLookup: failing,
        readSnapshot: async () => ({ state: 'withdrawn', reason: 'unpublished', checkedAt }),
      }),
      { source: 'withdrawn', reason: 'unpublished', stale: true },
    );
  } finally {
    console.warn = warn;
  }
});

test('a published version unconfirmed for longer than CMS_MAX_STALE_SECONDS is not served', async () => {
  const page = parseCmsProductPage(entry(), { key: 'accounting', locale: 'ru' }, configuration);
  const input = { key: 'accounting', locale: 'ru', draft: false } as const;
  const now = Date.parse('2026-11-03T12:00:00.000Z');
  const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();
  const limit = configuration.maxStaleSeconds;
  const failing = async (): Promise<CmsPublishedLookup> => {
    throw new CmsUnavailableError('CMS_TIMEOUT');
  };
  const base = {
    configuration,
    publishedLookup: failing,
    draftLookup: async () => null,
    readSnapshot: async (): Promise<CmsPublishedLookup | null> => null,
    now: () => now,
  };
  const events: string[] = [];
  const warn = console.warn;
  console.warn = (message: string) => {
    events.push(message);
  };
  try {
    // Snapshot within the limit: the last published version is served during the outage.
    assert.deepEqual(
      await resolveCmsProductPage(input, {
        ...base,
        readSnapshot: async () => ({ state: 'published', page, checkedAt: at(limit - 60) }),
      }),
      { source: 'cms', page, draft: false, stale: true },
    );
    // Beyond the limit (e.g. an unpublish notification was lost and the CMS is down): no content.
    assert.deepEqual(
      await resolveCmsProductPage(input, {
        ...base,
        readSnapshot: async () => ({ state: 'published', page, checkedAt: at(limit + 60) }),
      }),
      { source: 'unavailable', code: 'CMS_STALE_LIMIT' },
    );
    assert.match(events.at(-1) ?? '', /"fallback":"expired"/);
    // A withdrawn state never expires into content.
    assert.deepEqual(
      await resolveCmsProductPage(input, {
        ...base,
        readSnapshot: async () => ({
          state: 'withdrawn',
          reason: 'unpublished',
          checkedAt: at(limit * 10),
        }),
      }),
      { source: 'withdrawn', reason: 'unpublished', stale: true },
    );
    // A data-cache entry whose background refresh keeps failing is bounded the same way...
    const oldCached = async (): Promise<CmsPublishedLookup> => ({
      state: 'published',
      page,
      checkedAt: at(limit + 1),
    });
    assert.deepEqual(await resolveCmsProductPage(input, { ...base, publishedLookup: oldCached }), {
      source: 'unavailable',
      code: 'CMS_STALE_LIMIT',
    });
    // ...and a newer snapshot (withdrawn recorded by the webhook) wins over it.
    assert.deepEqual(
      await resolveCmsProductPage(input, {
        ...base,
        publishedLookup: oldCached,
        readSnapshot: async () => ({
          state: 'withdrawn',
          reason: 'unpublished',
          checkedAt: at(10),
        }),
      }),
      { source: 'withdrawn', reason: 'unpublished', stale: true },
    );
    // An entry that is only older than the refresh interval is still served (refreshed in the background).
    assert.deepEqual(
      await resolveCmsProductPage(input, {
        ...base,
        publishedLookup: async () => ({
          state: 'published',
          page,
          checkedAt: at(configuration.cacheSeconds + 30),
        }),
      }),
      { source: 'cms', page, draft: false, stale: false },
    );
  } finally {
    console.warn = warn;
  }
});

test('snapshots round-trip and ignore foreign or corrupted content', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cms-snapshots-'));
  try {
    const page = parseCmsProductPage(entry(), { key: 'accounting', locale: 'ru' }, configuration);
    assert.equal(await readCmsSnapshot(directory, 'accounting', 'ru'), null);
    const checkedAt = new Date().toISOString();
    await writeCmsSnapshot(directory, 'accounting', 'ru', { state: 'published', page, checkedAt });
    assert.deepEqual(await readCmsSnapshot(directory, 'accounting', 'ru'), {
      state: 'published',
      page,
      checkedAt,
    });
    assert.equal(await readCmsSnapshot(directory, 'accounting', 'lv'), null);
    await writeCmsSnapshot(directory, 'accounting', 'ru', {
      state: 'withdrawn',
      reason: 'unpublished',
      checkedAt,
    });
    const withdrawn = await readCmsSnapshot(directory, 'accounting', 'ru');
    assert.equal(withdrawn?.state === 'withdrawn' && withdrawn.reason, 'unpublished');
    await writeFile(
      path.join(directory, 'product-page', 'accounting.en.json'),
      '{not json',
      'utf8',
    );
    assert.equal(await readCmsSnapshot(directory, 'accounting', 'en'), null);
    // Snapshots of the first pilot version used `savedAt`; a snapshot without any time is ignored.
    const legacy = { state: 'withdrawn', reason: 'missing', savedAt: '2026-11-03T10:00:00.000Z' };
    await writeFile(
      path.join(directory, 'product-page', 'accounting.en.json'),
      JSON.stringify(legacy),
      'utf8',
    );
    assert.equal((await readCmsSnapshot(directory, 'accounting', 'en'))?.checkedAt, legacy.savedAt);
    const untimed = { state: 'withdrawn', reason: 'missing' };
    await writeFile(
      path.join(directory, 'product-page', 'accounting.en.json'),
      JSON.stringify(untimed),
      'utf8',
    );
    assert.equal(await readCmsSnapshot(directory, 'accounting', 'en'), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('middleware lets CMS endpoints through without a portal session', () => {
  for (const pathname of [
    '/api/cms/preview?sig=x',
    '/api/cms/revalidate',
    '/api/cms/preview/exit',
  ]) {
    const response = middleware(new NextRequest(`http://127.0.0.1:3000${pathname}`));
    assert.equal(response.headers.get('location'), null, pathname);
  }
});

test('start-up warm-up reconciles every locale with bounded retries, then requests the pages', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cms-warmup-'));
  const warn = console.warn;
  const events: string[] = [];
  console.warn = (message: string) => {
    events.push(message);
  };
  try {
    const warmConfiguration = { ...configuration, snapshotDirectory: directory };
    const sleeps: number[] = [];
    let cmsCalls = 0;
    const requestedPages: string[] = [];
    const fetchImplementation = (async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.origin === 'http://127.0.0.1:3000') {
        requestedPages.push(url.pathname);
        return new Response('ok');
      }
      cmsCalls += 1;
      // The CMS is down for the first two rounds (one call per locale), then answers.
      if (cmsCalls <= 6) throw new TypeError('fetch failed');
      const locale = url.searchParams.get('locale');
      const status = url.searchParams.get('status');
      if (locale === 'en')
        return Response.json({ data: status === 'draft' ? [entry({ locale })] : [] });
      return Response.json({ data: status === 'published' ? [entry({ locale })] : [] });
    }) as typeof fetch;

    const result = await warmCmsProductPages({
      configuration: warmConfiguration,
      siteOrigin: 'http://127.0.0.1:3000',
      fetchImplementation,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });
    assert.deepEqual(result.unreconciled, []);
    assert.deepEqual(sleeps, [1000, 2000]);
    assert.equal((await readCmsSnapshot(directory, 'accounting', 'lv'))?.state, 'published');
    const en = await readCmsSnapshot(directory, 'accounting', 'en');
    assert.equal(en?.state === 'withdrawn' && en.reason, 'unpublished');
    assert.deepEqual(
      requestedPages,
      ['lv', 'ru', 'en'].map((locale) => `/${locale}/solutions/buhgalteriya-predpriyatiya`),
    );
    assert.ok(events.some((event) => event.includes('cms.warmup.reconciled')));

    // A CMS that stays down: attempts and back-off are bounded and the existing snapshots stay.
    const failedSleeps: number[] = [];
    const down = await warmCmsProductPages({
      configuration: warmConfiguration,
      siteOrigin: null,
      attempts: 4,
      fetchImplementation: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
      sleep: async (milliseconds) => {
        failedSleeps.push(milliseconds);
      },
    });
    assert.deepEqual(down.unreconciled, ['accounting.lv', 'accounting.ru', 'accounting.en']);
    assert.deepEqual(failedSleeps, [1000, 2000, 4000]);
    assert.equal((await readCmsSnapshot(directory, 'accounting', 'lv'))?.state, 'published');
    assert.ok(events.some((event) => event.includes('cms.warmup.cms_unavailable')));
  } finally {
    console.warn = warn;
    await rm(directory, { recursive: true, force: true });
  }
});
