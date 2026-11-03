import { unstable_cache } from 'next/cache';
import { draftMode } from 'next/headers';
import { cache } from 'react';

import { loadCmsConfiguration } from './cms-configuration';
import { cmsProductPageTag, type CmsProductPageKey } from './cms-product-page-routes';
import {
  fetchAndRecordCmsProductPage,
  lookupDraftCmsProductPage,
  readCmsSnapshot,
  resolveCmsProductPage,
  type CmsProductPageResolution,
} from './cms-product-pages';
import type { Locale } from './i18n';

// Published content goes through the tagged data cache (invalidated by /api/cms/revalidate);
// drafts are read live and are never cached or written to snapshots.
export const getCmsProductPage = cache(async (key: CmsProductPageKey, locale: Locale): Promise<CmsProductPageResolution> => {
  const configuration = loadCmsConfiguration();
  if (!configuration.enabled) return { source: 'repository', reason: 'disabled' };

  const draft = (await draftMode()).isEnabled;
  return resolveCmsProductPage(
    { key, locale, draft },
    {
      configuration,
      publishedLookup: unstable_cache(
        () => fetchAndRecordCmsProductPage(configuration, key, locale),
        ['cms-product-page', key, locale],
        { tags: [cmsProductPageTag(key, locale)], revalidate: configuration.cacheSeconds },
      ),
      draftLookup: () => lookupDraftCmsProductPage(configuration, key, locale),
      readSnapshot: () => readCmsSnapshot(configuration.snapshotDirectory, key, locale),
    },
  );
});
