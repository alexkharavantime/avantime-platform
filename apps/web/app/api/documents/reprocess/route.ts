import { NextResponse } from 'next/server';

import { authorizeDocumentApi } from '../../../../lib/document-authorization';
import { getDocumentTenantContext } from '../../../../lib/document-model';
import { reprocessDocument } from '../../../../lib/document-services';
import { assertSafeDocumentSegment } from '../../../../lib/document-storage';
import { appendCriticalDocumentAudit } from '../../../../lib/production-audit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const authorization = await authorizeDocumentApi();
    if (authorization.response) return authorization.response;
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 });
    }
    const { documentId, dryRun = false } = body as {
      documentId?: unknown;
      dryRun?: unknown;
    };
    if (typeof documentId !== 'string' || typeof dryRun !== 'boolean') {
      return NextResponse.json({ error: 'Некорректные параметры.' }, { status: 400 });
    }
    assertSafeDocumentSegment(documentId, 'documentId');
    const tenant = getDocumentTenantContext(authorization.session);
    const result = await reprocessDocument(tenant, documentId, { dryRun });
    if (result.outcome === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Документ не найден.' }, { status: 404 });
    }
    await appendCriticalDocumentAudit(tenant, {
      action: 'document.reprocess',
      targetType: 'document',
      targetId: documentId,
      result: 'SUCCEEDED',
      safeMetadata: { dryRun, outcome: result.outcome },
    });
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json(
      { error: 'Не удалось повторно поставить документ в обработку.' },
      { status: 500 },
    );
  }
}
