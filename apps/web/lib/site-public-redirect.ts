import { NextResponse } from 'next/server';

import { sitePublicUrl } from './site-public-origin';

/** A redirect to a path of this site on its public origin; see `sitePublicUrl`. */
export function sitePublicRedirect(path: string, status: 303 | 307 = 303) {
  return new NextResponse(null, { status, headers: { location: sitePublicUrl(path) } });
}
