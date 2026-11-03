import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CmsConfiguration } from './cms-configuration';
import { isCmsProductPageKey, type CmsProductPageKey } from './cms-product-page-routes';
import { isLocale, type Locale } from './i18n';

export type CmsProductPage = {
  key: CmsProductPageKey;
  locale: Locale;
  name: string;
  lead: string;
  image: { url: string; alt: string };
  benefits: { title: string; text: string }[];
  approachTitle: string;
  approachText: string;
  ctaText: string;
  ctaButton: string;
  seo: { title: string | null; description: string | null; noIndex: boolean };
};

export type CmsWithdrawnReason = 'unpublished' | 'missing';

// Result of asking the CMS for the published version: "withdrawn" covers both an entry whose locale
// was unpublished (a draft remains) and a locale that does not exist at all. `checkedAt` is when the
// CMS confirmed this state; it bounds how long the state may be served without a fresh confirmation.
export type CmsPublishedLookup = (
  { state: 'published'; page: CmsProductPage } | { state: 'withdrawn'; reason: CmsWithdrawnReason }
) & { checkedAt: string };

export type CmsSnapshot = CmsPublishedLookup;

// Repository content is served only when the CMS is explicitly disabled. During an outage without a
// recorded snapshot the state is unknown (the page may have been withdrawn), so it is not guessed.
export type CmsProductPageResolution =
  | { source: 'repository'; reason: 'disabled' }
  | { source: 'cms'; page: CmsProductPage; draft: boolean; stale: boolean }
  | { source: 'withdrawn'; reason: CmsWithdrawnReason; stale: boolean }
  | { source: 'unavailable'; code: string };

type EnabledConfiguration = Extract<CmsConfiguration, { enabled: true }>;
type FetchImplementation = typeof fetch;

export class CmsUnavailableError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CmsUnavailableError';
  }
}

function text(value: unknown, field: string, optional = false) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (optional && (value === null || value === undefined || value === '')) return null;
  throw new CmsUnavailableError(`CMS_FIELD_${field.toUpperCase()}_INVALID`);
}

function mediaUrl(value: unknown, configuration: EnabledConfiguration) {
  const raw = text(value, 'image_url') as string;
  const url = new URL(raw, configuration.mediaUrl);
  if (url.origin !== configuration.mediaUrl || !url.pathname.startsWith('/uploads/')) {
    throw new CmsUnavailableError('CMS_FIELD_IMAGE_URL_INVALID');
  }
  return url.toString();
}

export function parseCmsProductPage(
  entry: unknown,
  expected: { key: CmsProductPageKey; locale: Locale },
  configuration: EnabledConfiguration,
): CmsProductPage {
  if (!entry || typeof entry !== 'object') throw new CmsUnavailableError('CMS_ENTRY_INVALID');
  const record = entry as Record<string, unknown>;
  if (record.key !== expected.key || record.locale !== expected.locale) {
    throw new CmsUnavailableError('CMS_ENTRY_MISMATCH');
  }
  const image = (record.image ?? null) as Record<string, unknown> | null;
  if (!image) throw new CmsUnavailableError('CMS_FIELD_IMAGE_INVALID');
  if (!Array.isArray(record.benefits) || record.benefits.length === 0) {
    throw new CmsUnavailableError('CMS_FIELD_BENEFITS_INVALID');
  }
  const seo = (record.seo ?? {}) as Record<string, unknown>;
  return {
    key: expected.key,
    locale: expected.locale,
    name: text(record.name, 'name') as string,
    lead: text(record.lead, 'lead') as string,
    image: {
      url: mediaUrl(image.url, configuration),
      alt: text(record.imageAlt, 'imageAlt') as string,
    },
    benefits: record.benefits.map((benefit) => {
      const item = (benefit ?? {}) as Record<string, unknown>;
      return {
        title: text(item.title, 'benefit_title') as string,
        text: text(item.text, 'benefit_text') as string,
      };
    }),
    approachTitle: text(record.approachTitle, 'approachTitle') as string,
    approachText: text(record.approachText, 'approachText') as string,
    ctaText: text(record.ctaText, 'ctaText') as string,
    ctaButton: text(record.ctaButton, 'ctaButton') as string,
    seo: {
      title: text(seo.metaTitle, 'seo_title', true),
      description: text(seo.metaDescription, 'seo_description', true),
      noIndex: seo.noIndex === true,
    },
  };
}

async function requestEntries(
  configuration: EnabledConfiguration,
  key: CmsProductPageKey,
  locale: Locale,
  status: 'published' | 'draft',
  fetchImplementation: FetchImplementation,
) {
  const url = new URL('/api/product-pages', configuration.url);
  url.search = new URLSearchParams({
    'filters[key][$eq]': key,
    locale,
    status,
    'populate[0]': 'image',
    'populate[1]': 'benefits',
    'populate[2]': 'seo',
    'pagination[pageSize]': '2',
  }).toString();
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      headers: { authorization: `Bearer ${configuration.apiToken}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(configuration.timeoutMs),
    });
  } catch (error) {
    throw new CmsUnavailableError(
      error instanceof Error && error.name === 'TimeoutError' ? 'CMS_TIMEOUT' : 'CMS_NETWORK_ERROR',
    );
  }
  if (!response.ok) throw new CmsUnavailableError(`CMS_HTTP_${response.status}`);
  const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
  if (!body || !Array.isArray(body.data)) throw new CmsUnavailableError('CMS_RESPONSE_INVALID');
  if (body.data.length > 1) throw new CmsUnavailableError('CMS_DUPLICATE_KEY');
  return body.data;
}

export async function lookupPublishedCmsProductPage(
  configuration: EnabledConfiguration,
  key: CmsProductPageKey,
  locale: Locale,
  fetchImplementation: FetchImplementation = fetch,
): Promise<CmsPublishedLookup> {
  const checkedAt = new Date().toISOString();
  const [published] = await requestEntries(
    configuration,
    key,
    locale,
    'published',
    fetchImplementation,
  );
  if (published) {
    return {
      state: 'published',
      page: parseCmsProductPage(published, { key, locale }, configuration),
      checkedAt,
    };
  }
  const drafts = await requestEntries(configuration, key, locale, 'draft', fetchImplementation);
  return { state: 'withdrawn', reason: drafts.length ? 'unpublished' : 'missing', checkedAt };
}

export async function lookupDraftCmsProductPage(
  configuration: EnabledConfiguration,
  key: CmsProductPageKey,
  locale: Locale,
  fetchImplementation: FetchImplementation = fetch,
) {
  const [draft] = await requestEntries(configuration, key, locale, 'draft', fetchImplementation);
  return draft ? parseCmsProductPage(draft, { key, locale }, configuration) : null;
}

function snapshotPath(directory: string, key: CmsProductPageKey, locale: Locale) {
  return path.join(directory, 'product-page', `${key}.${locale}.json`);
}

export async function readCmsSnapshot(directory: string, key: CmsProductPageKey, locale: Locale) {
  try {
    const raw = JSON.parse(
      await readFile(snapshotPath(directory, key, locale), 'utf8'),
    ) as CmsSnapshot & {
      savedAt?: string;
    };
    // Snapshots written by the first pilot version carry `savedAt` instead of `checkedAt`.
    const snapshot = { ...raw, checkedAt: raw.checkedAt ?? raw.savedAt } as CmsSnapshot;
    if (Number.isNaN(Date.parse(snapshot.checkedAt))) return null;
    if (
      snapshot.state === 'published' &&
      snapshot.page?.key === key &&
      snapshot.page.locale === locale
    )
      return snapshot;
    if (
      snapshot.state === 'withdrawn' &&
      (snapshot.reason === 'unpublished' || snapshot.reason === 'missing')
    ) {
      return snapshot;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeCmsSnapshot(
  directory: string,
  key: CmsProductPageKey,
  locale: Locale,
  lookup: CmsPublishedLookup,
) {
  const target = snapshotPath(directory, key, locale);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(lookup)}\n`, 'utf8');
  await rename(temporary, target);
}

// Fetches the published state and records it as the last known state for outages.
export async function fetchAndRecordCmsProductPage(
  configuration: EnabledConfiguration,
  key: CmsProductPageKey,
  locale: Locale,
  fetchImplementation: FetchImplementation = fetch,
) {
  const lookup = await lookupPublishedCmsProductPage(
    configuration,
    key,
    locale,
    fetchImplementation,
  );
  await writeCmsSnapshot(configuration.snapshotDirectory, key, locale, lookup).catch(() => {
    logCmsEvent('cms.snapshot.write_failed', { key, locale });
  });
  return lookup;
}

export function logCmsEvent(event: string, details: Record<string, string>) {
  console.warn(JSON.stringify({ event, ...details }));
}

export async function resolveCmsProductPage(
  input: { key: CmsProductPageKey; locale: Locale; draft: boolean },
  dependencies: {
    configuration: CmsConfiguration;
    publishedLookup: () => Promise<CmsPublishedLookup>;
    // Reads the CMS bypassing the data cache; used when the cached entry is past the stale limit.
    freshLookup?: () => Promise<CmsPublishedLookup>;
    draftLookup: () => Promise<CmsProductPage | null>;
    readSnapshot: () => Promise<CmsSnapshot | null>;
    now?: () => number;
  },
): Promise<CmsProductPageResolution> {
  const { configuration } = dependencies;
  if (!configuration.enabled) return { source: 'repository', reason: 'disabled' };

  if (input.draft) {
    const page = await dependencies.draftLookup();
    return page
      ? { source: 'cms', page, draft: true, stale: false }
      : { source: 'withdrawn', reason: 'missing', stale: false };
  }

  const now = dependencies.now?.() ?? Date.now();
  const ageSeconds = (state: CmsPublishedLookup) => {
    const checkedAt = Date.parse(state.checkedAt);
    return Number.isNaN(checkedAt) ? Number.POSITIVE_INFINITY : (now - checkedAt) / 1000;
  };
  // A published version is served without a fresh CMS confirmation for at most maxStaleSeconds,
  // so a lost unpublish notification combined with a CMS outage cannot keep a page online forever.
  const tooOld = (state: CmsPublishedLookup) =>
    state.state === 'published' && ageSeconds(state) > configuration.maxStaleSeconds;

  let lookup: CmsPublishedLookup | null = null;
  let code = 'CMS_STALE_LIMIT';
  try {
    lookup = await dependencies.publishedLookup();
  } catch (error) {
    code = error instanceof CmsUnavailableError ? error.code : 'CMS_UNEXPECTED_ERROR';
  }

  // After a quiet period the data cache returns its old entry while refreshing in the background;
  // confirm with the CMS now instead of failing a request the CMS could answer.
  if (lookup && tooOld(lookup) && dependencies.freshLookup) {
    try {
      lookup = await dependencies.freshLookup();
    } catch (error) {
      code = error instanceof CmsUnavailableError ? error.code : 'CMS_UNEXPECTED_ERROR';
    }
  }

  if (lookup && !tooOld(lookup)) {
    if (lookup.state === 'published')
      return { source: 'cms', page: lookup.page, draft: false, stale: false };
    if (lookup.reason === 'missing') {
      logCmsEvent('cms.product_page.missing', { key: input.key, locale: input.locale });
    }
    return { source: 'withdrawn', reason: lookup.reason, stale: false };
  }

  // The CMS could not confirm the state: use the newest last known state.
  const snapshot = await dependencies.readSnapshot();
  const lastKnown = [lookup, snapshot]
    .filter((state): state is CmsPublishedLookup => state !== null)
    .sort((left, right) => ageSeconds(left) - ageSeconds(right))[0];
  const fallback = !lastKnown
    ? 'none'
    : tooOld(lastKnown)
      ? 'expired'
      : `last-known-${lastKnown.state}`;
  logCmsEvent('cms.product_page.unavailable', {
    code,
    key: input.key,
    locale: input.locale,
    fallback,
  });
  if (lastKnown?.state === 'withdrawn')
    return { source: 'withdrawn', reason: lastKnown.reason, stale: true };
  if (lastKnown && !tooOld(lastKnown))
    return { source: 'cms', page: lastKnown.page, draft: false, stale: true };
  return { source: 'unavailable', code: lastKnown ? 'CMS_STALE_LIMIT' : code };
}

export function parseCmsRevalidateRequest(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (record.model !== 'product-page' || !isCmsProductPageKey(record.key)) return null;
  if (record.action !== 'publish' && record.action !== 'unpublish' && record.action !== 'delete')
    return null;
  if (!Array.isArray(record.locales) || record.locales.length === 0 || record.locales.length > 3)
    return null;
  if (!record.locales.every((locale) => isLocale(locale))) return null;
  return {
    key: record.key,
    locales: [...new Set(record.locales as Locale[])],
    action: record.action,
  };
}
