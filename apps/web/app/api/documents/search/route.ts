import { NextResponse } from 'next/server';

import { assertApiRateLimit, ApiRateLimitError } from '../../../../lib/api-rate-limit';
import { authorizeDocumentApi } from '../../../../lib/document-authorization';
import { isDocumentType } from '../../../../lib/document-intelligence-model';
import type { DocumentType } from '../../../../lib/document-intelligence-model';
import { getDocumentTenantContext } from '../../../../lib/document-model';
import { getDocumentServices } from '../../../../lib/document-services';
import { RetrievalInputError, type RetrievalMode } from '../../../../lib/retrieval';

export const runtime = 'nodejs';

function parseMode(value: string | null): RetrievalMode | null {
  if (value === null || value === 'lexical') return 'lexical';
  if (value === 'semantic' || value === 'hybrid') return value;
  return null;
}

export async function GET(request: Request) {
  try {
    const authorization = await authorizeDocumentApi();
    if (authorization.response) return authorization.response;
    const tenant = getDocumentTenantContext(authorization.session);
    const services = getDocumentServices();
    if (!services.rag) {
      return NextResponse.json(
        { error: 'Поиск временно недоступен.', code: 'RAG_UNAVAILABLE' },
        { status: 503 },
      );
    }
    assertApiRateLimit(tenant, services.rag.configuration.limits.rateLimitPerMinute);
    const url = new URL(request.url);
    if (url.searchParams.has('companyId')) {
      return NextResponse.json(
        { error: 'Параметр companyId не поддерживается.', code: 'TENANT_INPUT_REJECTED' },
        { status: 400 },
      );
    }
    const mode = parseMode(url.searchParams.get('mode'));
    if (!mode) {
      return NextResponse.json(
        { error: 'Неизвестный режим поиска.', code: 'INVALID_SEARCH_MODE' },
        { status: 400 },
      );
    }
    const query = url.searchParams.get('q')?.trim() ?? '';
    const topKValue = url.searchParams.get('topK');
    const topK = topKValue ? Number(topKValue) : undefined;
    const rawTypes = url.searchParams
      .getAll('documentType')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);
    if (rawTypes.some((value) => !isDocumentType(value))) {
      return NextResponse.json(
        { error: 'Некорректный тип документа.', code: 'INVALID_DOCUMENT_TYPE' },
        { status: 400 },
      );
    }
    const documentTypes = rawTypes.filter((value): value is DocumentType => isDocumentType(value));
    const retriever =
      mode === 'lexical'
        ? services.rag.lexical
        : mode === 'semantic'
          ? services.rag.semantic
          : services.rag.hybrid;
    const correlationId = crypto.randomUUID();
    const results = await retriever.retrieve({
      tenant,
      query,
      topK,
      correlationId,
      filters: {
        documentTypes,
        createdFrom: url.searchParams.get('createdFrom') ?? undefined,
        createdTo: url.searchParams.get('createdTo') ?? undefined,
      },
    });
    return NextResponse.json({
      query,
      mode,
      total: results.length,
      correlationId,
      results,
    });
  } catch (error) {
    if (error instanceof RetrievalInputError) {
      return NextResponse.json(
        { error: 'Некорректные параметры поиска.', code: error.code },
        { status: 400 },
      );
    }
    if (error instanceof ApiRateLimitError) {
      return NextResponse.json(
        { error: 'Слишком много запросов.', code: error.code },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: 'Не удалось выполнить поиск.', code: 'RETRIEVAL_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
