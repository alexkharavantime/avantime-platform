import { revalidateTag } from 'next/cache';

import { loadCmsConfiguration } from '../../../../lib/cms-configuration';
import { cmsProductPageTag } from '../../../../lib/cms-product-page-routes';
import {
  fetchAndRecordCmsProductPage,
  logCmsEvent,
  parseCmsRevalidateRequest,
  writeCmsSnapshot,
} from '../../../../lib/cms-product-pages';
import { verifyCmsBearer } from '../../../../lib/cms-preview-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAXIMUM_PAYLOAD_BYTES = 8192;
const noStore = { 'cache-control': 'no-store' };

// Called by the CMS after publish/unpublish/delete. Only tags of allow-listed product pages can be invalidated.
export async function POST(request: Request) {
  const configuration = loadCmsConfiguration();
  if (!configuration.enabled)
    return Response.json({ error: 'CMS_DISABLED' }, { status: 404, headers: noStore });
  if (!verifyCmsBearer(configuration.revalidateSecret, request.headers.get('authorization'))) {
    return Response.json(
      { error: 'CMS_REVALIDATE_UNAUTHORIZED' },
      { status: 401, headers: noStore },
    );
  }
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAXIMUM_PAYLOAD_BYTES) {
    return Response.json(
      { error: 'CMS_REVALIDATE_PAYLOAD_TOO_LARGE' },
      { status: 413, headers: noStore },
    );
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAXIMUM_PAYLOAD_BYTES) {
    return Response.json(
      { error: 'CMS_REVALIDATE_PAYLOAD_TOO_LARGE' },
      { status: 413, headers: noStore },
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = null;
  }
  const parsed = parseCmsRevalidateRequest(body);
  if (!parsed)
    return Response.json({ error: 'CMS_REVALIDATE_INVALID' }, { status: 400, headers: noStore });

  const revalidated: string[] = [];
  for (const locale of parsed.locales) {
    // Refresh the outage snapshot now, so a later CMS outage cannot bring back withdrawn content.
    await fetchAndRecordCmsProductPage(configuration, parsed.key, locale).catch(async () => {
      logCmsEvent('cms.revalidate.refresh_failed', {
        key: parsed.key,
        locale,
        action: parsed.action,
      });
      if (parsed.action !== 'publish') {
        await writeCmsSnapshot(configuration.snapshotDirectory, parsed.key, locale, {
          state: 'withdrawn',
          reason: 'unpublished',
          checkedAt: new Date().toISOString(),
        }).catch(() => undefined);
      }
    });
    const tag = cmsProductPageTag(parsed.key, locale);
    revalidateTag(tag);
    revalidated.push(tag);
  }
  return Response.json({ revalidated }, { headers: noStore });
}
