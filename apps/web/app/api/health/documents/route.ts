import { NextResponse } from 'next/server';

import { authorizeDocumentApi } from '../../../../lib/document-authorization';
import { checkDocumentReadiness } from '../../../../lib/document-health';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') ?? 'liveness';
  if (mode === 'liveness') {
    return NextResponse.json({
      status: 'ok',
    });
  }
  if (mode !== 'readiness') {
    return NextResponse.json(
      {
        status: 'invalid',
      },
      {
        status: 400,
      },
    );
  }

  const details = url.searchParams.get('details') === 'true';
  if (details) {
    const authorization = await authorizeDocumentApi();
    if (authorization.response) return authorization.response;
  }

  const readiness = await checkDocumentReadiness();
  const responseStatus = readiness.status === 'ready' ? 200 : 503;
  return NextResponse.json(
    details
      ? readiness
      : {
          status: readiness.status,
        },
    {
      status: responseStatus,
    },
  );
}
