import { NextResponse } from 'next/server';

import { authorizeDocumentDownloadApi } from '../../../../lib/document-authorization';
import {
  getDocumentTenantContext,
  UNVERIFIED_DOCUMENT_CHECKSUM,
} from '../../../../lib/document-model';
import { getDocumentServices } from '../../../../lib/document-services';
import { appendPortalAudit } from '../../../../lib/portal-audit';

export async function GET(request: Request) {
  try {
    const authorization = await authorizeDocumentDownloadApi();
    if (authorization.response) return authorization.response;

    const tenant = getDocumentTenantContext(authorization.session);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Не указан документ.' }, { status: 400 });
    }

    const services = getDocumentServices();
    const document = await services.metadata.findById(tenant, id);
    if (!document) {
      return NextResponse.json({ error: 'Документ не найден.' }, { status: 404 });
    }

    const file = await services.storage.read(
      tenant,
      'original',
      document.storedName,
      document.checksum === UNVERIFIED_DOCUMENT_CHECKSUM
        ? undefined
        : {
            expectedChecksum: document.checksum,
          },
    );
    if (!file) {
      return NextResponse.json({ error: 'Файл не найден.' }, { status: 404 });
    }
    await appendPortalAudit(
      authorization.session,
      {
        action: 'portal.document.download',
        targetType: 'document',
        targetId: document.id,
        result: 'SUCCEEDED',
        metadata: { sizeBytes: document.size },
      },
      request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID(),
    );

    return new NextResponse(new Uint8Array(file), {
      status: 200,
      headers: {
        'Content-Type': document.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(document.originalName)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Document file error:', error);

    return NextResponse.json({ error: 'Не удалось открыть документ.' }, { status: 500 });
  }
}
