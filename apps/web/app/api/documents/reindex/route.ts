import { NextResponse } from 'next/server';

import { planDocumentReindex } from '../../../../lib/document-embedding';
import { authorizeDocumentReprocessApi } from '../../../../lib/document-authorization';
import { getDocumentTenantContext } from '../../../../lib/document-model';
import { getDocumentServices } from '../../../../lib/document-services';
import { appendCriticalDocumentAudit } from '../../../../lib/production-audit';

export const runtime = 'nodejs';

type ReindexRequest = {
  documentId?: unknown;
  dryRun?: unknown;
  companyId?: unknown;
};

function executionIsAllowed() {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_PRODUCTION_DOCUMENT_REINDEX !== '1'
  ) {
    return false;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return true;
  try {
    const hostname = new URL(databaseUrl).hostname;
    const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    return local || process.env.ALLOW_REMOTE_DOCUMENT_REINDEX === '1';
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeDocumentReprocessApi();
    if (authorization.response) return authorization.response;
    const tenant = getDocumentTenantContext(authorization.session);
    const body = (await request.json()) as ReindexRequest;
    if (body.companyId !== undefined) {
      return NextResponse.json(
        { error: 'Поле companyId не поддерживается.', code: 'TENANT_INPUT_REJECTED' },
        { status: 400 },
      );
    }
    if (
      typeof body.documentId !== 'string' ||
      body.documentId.length === 0 ||
      body.documentId.length > 200 ||
      (body.dryRun !== undefined && typeof body.dryRun !== 'boolean')
    ) {
      return NextResponse.json(
        { error: 'Некорректные параметры reindex.', code: 'REINDEX_INVALID_INPUT' },
        { status: 400 },
      );
    }
    const dryRun = body.dryRun !== false;
    if (!dryRun && !executionIsAllowed()) {
      return NextResponse.json(
        {
          error: 'Выполнение reindex запрещено для этого окружения.',
          code: 'REINDEX_EXECUTION_FORBIDDEN',
        },
        { status: 403 },
      );
    }
    const services = getDocumentServices();
    if (!services.rag) {
      return NextResponse.json(
        { error: 'Индексация недоступна.', code: 'RAG_UNAVAILABLE' },
        { status: 503 },
      );
    }
    const result = await planDocumentReindex(
      tenant,
      body.documentId,
      dryRun,
      services.rag.embedding,
    );
    if (result.outcome !== 'NOT_FOUND') {
      await appendCriticalDocumentAudit(tenant, {
        action: 'document.reindex',
        targetType: 'document',
        targetId: body.documentId,
        result: 'SUCCEEDED',
        safeMetadata: { dryRun, outcome: result.outcome },
      });
    }
    return NextResponse.json(result, {
      status: result.outcome === 'NOT_FOUND' ? 404 : 200,
    });
  } catch {
    return NextResponse.json(
      { error: 'Не удалось подготовить reindex.', code: 'REINDEX_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
