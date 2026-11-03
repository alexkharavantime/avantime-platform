import { unstable_cache } from 'next/cache';
import { draftMode } from 'next/headers';
import { cache } from 'react';

import { loadCmsConfiguration } from './cms-configuration';
import {
  cmsProductPageAlternates,
  cmsProductPageTag,
  type CmsProductPageKey,
} from './cms-product-page-routes';
import {
  fetchAndRecordCmsProductPage,
  lookupDraftCmsProductPage,
  readCmsSnapshot,
  resolveCmsProductPage,
  type CmsProductPageResolution,
} from './cms-product-pages';
import { locales, type Locale } from './i18n';

// Part of the data cache key: a persisted cache entry from a previous process is never reused, so
// a restart re-checks the CMS instead of trusting state that may have missed a webhook meanwhile.
const processEpoch = String(Math.trunc(performance.timeOrigin));

// Published content goes through the tagged data cache (invalidated by /api/cms/revalidate);
// drafts are read live and are never cached or written to snapshots.
export const getCmsProductPage = cache(
  async (key: CmsProductPageKey, locale: Locale): Promise<CmsProductPageResolution> => {
    const configuration = loadCmsConfiguration();
    if (!configuration.enabled) return { source: 'repository', reason: 'disabled' };

    const draft = (await draftMode()).isEnabled;
    return resolveCmsProductPage(
      { key, locale, draft },
      {
        configuration,
        publishedLookup: unstable_cache(
          () => fetchAndRecordCmsProductPage(configuration, key, locale),
          ['cms-product-page', key, locale, processEpoch],
          { tags: [cmsProductPageTag(key, locale)], revalidate: configuration.cacheSeconds },
        ),
        freshLookup: () => fetchAndRecordCmsProductPage(configuration, key, locale),
        draftLookup: () => lookupDraftCmsProductPage(configuration, key, locale),
        readSnapshot: () => readCmsSnapshot(configuration.snapshotDirectory, key, locale),
      },
    );
  },
);

export async function getCmsProductPageAlternates(key: CmsProductPageKey, locale: Locale) {
  const resolutions = await Promise.all(
    locales.map((candidate) => getCmsProductPage(key, candidate)),
  );
  const published = locales.filter((_, index) => resolutions[index]?.source === 'cms');
  return cmsProductPageAlternates(key, locale, published);
}
