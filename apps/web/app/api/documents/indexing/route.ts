import { NextResponse } from 'next/server';

import { authorizeDocumentReprocessApi } from '../../../../lib/document-authorization';
import { getDocumentTenantContext, toDocumentApiItem } from '../../../../lib/document-model';
import { getDocumentServices } from '../../../../lib/document-services';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const authorization = await authorizeDocumentReprocessApi();
    if (authorization.response) return authorization.response;
    const tenant = getDocumentTenantContext(authorization.session);
    const url = new URL(request.url);
    if (url.searchParams.has('companyId')) {
      return NextResponse.json(
        { error: 'Параметр companyId не поддерживается.', code: 'TENANT_INPUT_REJECTED' },
        { status: 400 },
      );
    }
    const services = getDocumentServices();
    const id = url.searchParams.get('documentId');
    const documents = id
      ? [await services.metadata.findById(tenant, id)].filter(
          (document): document is NonNullable<typeof document> => Boolean(document),
        )
      : await services.metadata.list(tenant);
    return NextResponse.json({
      documents: documents.map((document) => {
        const item = toDocumentApiItem(document);
        return {
          documentId: item.id,
          documentTitle: item.name,
          processingStatus: item.processingStatus,
          embeddingStatus: item.embeddingStatus,
          embeddingModel: item.embeddingModel,
          embeddingDimensions: item.embeddingDimensions,
          embeddingVersion: item.embeddingVersion,
          embeddedAt: item.embeddedAt,
          embeddingAttempts: item.embeddingAttempts,
          lastEmbeddingErrorCode: item.lastEmbeddingErrorCode,
        };
      }),
    });
  } catch {
    return NextResponse.json(
      { error: 'Не удалось получить статус индексации.', code: 'INDEX_STATUS_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
