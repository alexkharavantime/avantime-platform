import { defaultLocale, localePath, locales, type Locale } from './i18n';

// Product pages whose content may come from the CMS. Keys are the CMS `key` enumeration values;
// paths are fixed here so preview links and webhooks can never point anywhere else.
export const cmsProductPageRoutes = {
  accounting: { slug: 'buhgalteriya-predpriyatiya' },
} as const;

export type CmsProductPageKey = keyof typeof cmsProductPageRoutes;

export function isCmsProductPageKey(value: unknown): value is CmsProductPageKey {
  return typeof value === 'string' && Object.hasOwn(cmsProductPageRoutes, value);
}

export function cmsProductPageKeyForSlug(slug: string): CmsProductPageKey | null {
  const match = Object.entries(cmsProductPageRoutes).find(([, route]) => route.slug === slug);
  return match ? (match[0] as CmsProductPageKey) : null;
}

export function cmsProductPagePath(key: CmsProductPageKey, locale: Locale) {
  return localePath(locale, `/solutions/${cmsProductPageRoutes[key].slug}`);
}

export function cmsProductPageTag(key: CmsProductPageKey, locale: Locale) {
  return `cms:product-page:${key}:${locale}`;
}

// hreflang alternates of a CMS page: only locales that are published, x-default only while the
// default locale is published (the root layout otherwise lists every locale).
export function cmsProductPageAlternates(
  key: CmsProductPageKey,
  locale: Locale,
  published: readonly Locale[],
) {
  const languages: Record<string, string> = {};
  for (const candidate of locales) {
    if (published.includes(candidate)) languages[candidate] = cmsProductPagePath(key, candidate);
  }
  if (published.includes(defaultLocale))
    languages['x-default'] = cmsProductPagePath(key, defaultLocale);
  return { canonical: cmsProductPagePath(key, locale), languages };
}
