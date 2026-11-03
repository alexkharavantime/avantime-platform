import { createHmac, timingSafeEqual } from 'node:crypto';

import { isLocale, type Locale } from './i18n';
import { isCmsProductPageKey, type CmsProductPageKey } from './cms-product-page-routes';

export type CmsPreviewStatus = 'draft' | 'published';

export type CmsPreviewRequest = {
  type: 'product-page';
  key: CmsProductPageKey;
  locale: Locale;
  status: CmsPreviewStatus;
  expiresAt: number;
};

// Links are issued by the CMS for 15 minutes; anything further ahead is not one of ours.
const MAXIMUM_LIFETIME_SECONDS = 60 * 60;

// Must stay byte-for-byte compatible with cms/src/site-integration.ts in the CMS project.
export function signCmsPreview(secret: string, input: Omit<CmsPreviewRequest, 'type'> & { type: string }) {
  const payload = ['v1', input.type, input.key, input.locale, input.status, String(input.expiresAt)].join('|');
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function verifyCmsPreviewRequest(
  secret: string,
  parameters: URLSearchParams,
  nowSeconds = Math.floor(Date.now() / 1000),
): CmsPreviewRequest | null {
  const type = parameters.get('type');
  const key = parameters.get('key');
  const locale = parameters.get('locale');
  const status = parameters.get('status');
  const expiresAt = Number(parameters.get('exp'));
  const signature = parameters.get('sig') ?? '';
  if (type !== 'product-page' || !isCmsProductPageKey(key) || !isLocale(locale)) return null;
  if (status !== 'draft' && status !== 'published') return null;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds) return null;
  if (expiresAt > nowSeconds + MAXIMUM_LIFETIME_SECONDS) return null;

  const request: CmsPreviewRequest = { type, key, locale, status, expiresAt };
  const expected = Buffer.from(signCmsPreview(secret, request), 'utf8');
  const provided = Buffer.from(signature, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return request;
}

export function verifyCmsBearer(secret: string, authorization: string | null) {
  const match = /^Bearer (.+)$/u.exec(authorization ?? '');
  if (!match) return false;
  const expected = Buffer.from(secret, 'utf8');
  const provided = Buffer.from(match[1], 'utf8');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
