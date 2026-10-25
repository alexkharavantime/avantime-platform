import { NextResponse } from 'next/server';

import { AiGatewayError } from '../../../../lib/ai-gateway';
import { assertApiRateLimit, ApiRateLimitError } from '../../../../lib/api-rate-limit';
import { authorizeDocumentReadApi } from '../../../../lib/document-authorization';
import { getDocumentTenantContext } from '../../../../lib/document-model';
import { getDocumentServices } from '../../../../lib/document-services';

export const runtime = 'nodejs';

type AskRequest = {
  question?: unknown;
  companyId?: unknown;
};

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const authorization = await authorizeDocumentReadApi();
    if (authorization.response) return authorization.response;
    const tenant = getDocumentTenantContext(authorization.session);
    const services = getDocumentServices();
    if (!services.rag) {
      return NextResponse.json(
        { error: 'RAG временно недоступен.', code: 'RAG_UNAVAILABLE', correlationId },
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
      correlationId,
    });
    return NextResponse.json({
      ...result,
      providerMode: {
        embedding: services.rag.configuration.embedding.driver,
        answer: services.rag.configuration.answer.driver,
      },
    });
  } catch (error) {
    if (error instanceof ApiRateLimitError || error instanceof AiGatewayError) {
      const status =
        error instanceof ApiRateLimitError || error.code === 'AI_RATE_LIMITED' ? 429 : 503;
      if (error instanceof AiGatewayError) {
        console.error(
          JSON.stringify({
            event: 'knowledge_ask_ai_failure',
            correlationId,
            errorCode: error.code,
            ...(error.budgetReason ? { budgetReason: error.budgetReason } : {}),
            ...(error.providerDiagnostic ? { providerDiagnostic: error.providerDiagnostic } : {}),
          }),
        );
      }
      return NextResponse.json(
        {
          error: status === 429 ? 'Слишком много запросов.' : 'Не удалось получить ответ AI.',
          code: error.code,
          correlationId,
          ...(error instanceof AiGatewayError && error.budgetReason
            ? { budgetReason: error.budgetReason }
            : {}),
          ...(error instanceof AiGatewayError &&
          error.providerDiagnostic?.incompleteReason === 'max_output_tokens'
            ? { reason: 'output_limit' }
            : {}),
        },
        { status },
      );
    }
    const errorCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string' &&
      /^[A-Za-z0-9_-]{1,40}$/u.test(error.code)
        ? error.code
        : undefined;
    console.error(
      JSON.stringify({
        event: 'knowledge_ask_unexpected_failure',
        correlationId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        ...(errorCode ? { errorCode } : {}),
      }),
    );
    return NextResponse.json(
      { error: 'Не удалось получить ответ AI.', code: 'RAG_UNAVAILABLE', correlationId },
      { status: 503 },
    );
  }
}
