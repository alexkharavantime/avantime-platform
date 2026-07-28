import { NextResponse } from 'next/server';

import { AiGatewayError } from '../../../../lib/ai-gateway';
import { assertApiRateLimit, ApiRateLimitError } from '../../../../lib/api-rate-limit';
import { authorizeDocumentApi } from '../../../../lib/document-authorization';
import { getDocumentTenantContext } from '../../../../lib/document-model';
import { getDocumentServices } from '../../../../lib/document-services';

export const runtime = 'nodejs';

type AskRequest = {
  question?: unknown;
  companyId?: unknown;
};

export async function POST(request: Request) {
  try {
    const authorization = await authorizeDocumentApi();
    if (authorization.response) return authorization.response;
    const tenant = getDocumentTenantContext(authorization.session);
    const services = getDocumentServices();
    if (!services.rag) {
      return NextResponse.json(
        { error: 'RAG временно недоступен.', code: 'RAG_UNAVAILABLE' },
        { status: 503 },
      );
    }
    assertApiRateLimit(tenant, services.rag.configuration.limits.rateLimitPerMinute);
    const body = (await request.json()) as AskRequest;
    if (body.companyId !== undefined) {
      return NextResponse.json(
        { error: 'Поле companyId не поддерживается.', code: 'TENANT_INPUT_REJECTED' },
        { status: 400 },
      );
    }
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (
      question.length < 3 ||
      question.length > services.rag.configuration.limits.queryMaximumCharacters
    ) {
      return NextResponse.json(
        { error: 'Некорректная длина вопроса.', code: 'RAG_INVALID_QUESTION' },
        { status: 400 },
      );
    }
    const result = await services.rag.answers.answer({
      tenant,
      question,
      correlationId: crypto.randomUUID(),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiRateLimitError || error instanceof AiGatewayError) {
      const status =
        error instanceof ApiRateLimitError || error.code === 'AI_RATE_LIMITED' ? 429 : 503;
      return NextResponse.json(
        {
          error: status === 429 ? 'Слишком много запросов.' : 'Не удалось получить ответ AI.',
          code: error.code,
        },
        { status },
      );
    }
    return NextResponse.json(
      { error: 'Не удалось получить ответ AI.', code: 'RAG_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
