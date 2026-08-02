import { NextResponse } from 'next/server';

import { authorizePlatformApi } from '../../../../lib/platform-authorization';
import { checkStagingReadiness } from '../../../../lib/staging-readiness';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authorization = await authorizePlatformApi('platform.view');
  if (authorization.response) return authorization.response;
  const report = await checkStagingReadiness({
    correlationId: request.headers.get('x-correlation-id') ?? undefined,
    includeDetails: true,
  });
  return NextResponse.json(report, {
    status: report.status === 'ready' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
