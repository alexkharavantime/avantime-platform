import { loadCmsConfiguration, type CmsConfiguration } from './cms-configuration';
import {
  cmsProductPagePath,
  cmsProductPageRoutes,
  type CmsProductPageKey,
} from './cms-product-page-routes';
import { fetchAndRecordCmsProductPage, logCmsEvent } from './cms-product-pages';
import { locales, type Locale } from './i18n';

type EnabledConfiguration = Extract<CmsConfiguration, { enabled: true }>;

export type CmsWarmupOptions = {
  configuration: EnabledConfiguration;
  // Origin of this web process for page warm-up; null skips it.
  siteOrigin: string | null;
  attempts?: number;
  baseDelayMs?: number;
  maximumDelayMs?: number;
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

// Runs once after the web process starts: re-reads the state of every CMS page from the CMS (which
// also refreshes the outage snapshots and reconciles notifications missed while the site was down),
// then requests each page once so the first visitor gets a warm cache. Retries are bounded; when the
// CMS stays unavailable the existing snapshots keep serving within CMS_MAX_STALE_SECONDS.
export async function warmCmsProductPages(options: CmsWarmupOptions) {
  const {
    configuration,
    siteOrigin,
    attempts = 6,
    baseDelayMs = 1000,
    maximumDelayMs = 15000,
    fetchImplementation = fetch,
    sleep = defaultSleep,
  } = options;
  let pending: { key: CmsProductPageKey; locale: Locale }[] = Object.keys(
    cmsProductPageRoutes,
  ).flatMap((key) => locales.map((locale) => ({ key: key as CmsProductPageKey, locale })));
  const states: string[] = [];

  for (let attempt = 1; attempt <= attempts && pending.length > 0; attempt += 1) {
    if (attempt > 1) await sleep(Math.min(baseDelayMs * 2 ** (attempt - 2), maximumDelayMs));
    const failed: typeof pending = [];
    for (const page of pending) {
      try {
        const lookup = await fetchAndRecordCmsProductPage(
          configuration,
          page.key,
          page.locale,
          fetchImplementation,
        );
        states.push(`${page.key}.${page.locale}:${lookup.state}`);
      } catch {
        failed.push(page);
      }
    }
    pending = failed;
  }

  const unreconciled = pending.map((page) => `${page.key}.${page.locale}`);
  logCmsEvent(unreconciled.length ? 'cms.warmup.cms_unavailable' : 'cms.warmup.reconciled', {
    states: states.join(','),
    unreconciled: unreconciled.join(','),
  });

  const pages: string[] = [];
  if (siteOrigin) {
    for (const key of Object.keys(cmsProductPageRoutes) as CmsProductPageKey[]) {
      for (const locale of locales) {
        const path = cmsProductPagePath(key, locale);
        let status = 'unreachable';
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const response = await fetchImplementation(new URL(path, siteOrigin), {
              cache: 'no-store',
              redirect: 'manual',
              signal: AbortSignal.timeout(configuration.timeoutMs * 3),
            });
            await response.arrayBuffer().catch(() => undefined);
            status = String(response.status);
            break;
          } catch {
            if (attempt < 3) await sleep(baseDelayMs);
          }
        }
        pages.push(`${path}:${status}`);
      }
    }
    logCmsEvent('cms.warmup.pages', { pages: pages.join(',') });
  }
  return { unreconciled, pages };
}

// Called from instrumentation.ts when the web process starts; never blocks or fails the start.
export function startCmsWarmup(environment: Record<string, string | undefined> = process.env) {
  if (environment.NEXT_PHASE === 'phase-production-build') return;
  if ((environment.CMS_PILOT_MODE?.trim() || 'off') === 'off') return;
  let configuration: CmsConfiguration;
  try {
    configuration = loadCmsConfiguration(environment);
  } catch (error) {
    logCmsEvent('cms.warmup.configuration_invalid', {
      code: error instanceof Error ? error.message : 'UNKNOWN',
    });
    return;
  }
  if (!configuration.enabled) return;
  void warmCmsProductPages({
    configuration,
    siteOrigin: `http://127.0.0.1:${environment.PORT?.trim() || '3000'}`,
  }).catch(() => logCmsEvent('cms.warmup.failed', {}));
}
