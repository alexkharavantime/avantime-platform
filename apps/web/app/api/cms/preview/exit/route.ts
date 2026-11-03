import { draftMode } from 'next/headers';

import {
  cmsProductPagePath,
  isCmsProductPageKey,
} from '../../../../../lib/cms-product-page-routes';
import { isLocale } from '../../../../../lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  (await draftMode()).disable();
  const parameters = new URL(request.url).searchParams;
  const key = parameters.get('key');
  const locale = parameters.get('locale');
  const location =
    isCmsProductPageKey(key) && isLocale(locale) ? cmsProductPagePath(key, locale) : '/';
  return new Response(null, { status: 307, headers: { location, 'cache-control': 'no-store' } });
}
