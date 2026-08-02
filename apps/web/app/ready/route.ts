import { NextResponse } from 'next/server';

import { checkStagingReadiness, publicStagingReadiness } from '../../lib/staging-readiness';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const report = await checkStagingReadiness({
    correlationId: request.headers.get('x-correlation-id') ?? undefined,
  });
  return NextResponse.json(publicStagingReadiness(report), {
    status: report.status === 'ready' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
