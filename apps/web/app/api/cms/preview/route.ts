import { draftMode } from 'next/headers';

import { loadCmsConfiguration } from '../../../../lib/cms-configuration';
import { cmsProductPagePath } from '../../../../lib/cms-product-page-routes';
import { verifyCmsPreviewRequest } from '../../../../lib/cms-preview-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' };

// Entered from the CMS preview with a short-lived HMAC-signed link; redirects only to the fixed page path.
export async function GET(request: Request) {
  const configuration = loadCmsConfiguration();
  if (!configuration.enabled) return new Response('Not found', { status: 404, headers: noStore });
  const preview = verifyCmsPreviewRequest(configuration.previewSecret, new URL(request.url).searchParams);
  if (!preview) return Response.json({ error: 'CMS_PREVIEW_INVALID' }, { status: 401, headers: noStore });

  const draft = await draftMode();
  if (preview.status === 'draft') draft.enable();
  else draft.disable();
  return new Response(null, {
    status: 307,
    headers: { ...noStore, location: cmsProductPagePath(preview.key, preview.locale) },
  });
}
