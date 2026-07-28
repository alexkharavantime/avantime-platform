import { authorizeApi } from '../../../lib/authorization';
import { getDocumentTenantContext } from '../../../lib/document-model';
import { getDocumentServices } from '../../../lib/document-services';

export async function POST(request: Request) {
  try {
    const authorization = await authorizeApi(['ADMIN']);
    if (authorization.response) return authorization.response;
    const services = getDocumentServices();
    if (!services.rag) {
      return Response.json(
        { text: 'AI Gateway временно недоступен.', code: 'AI_GATEWAY_UNAVAILABLE' },
        { status: 503 },
      );
    }
    const body = (await request.json()) as {
      prompt?: unknown;
      companyId?: unknown;
    };
    if (body.companyId !== undefined) {
      return Response.json(
        { text: 'Поле companyId не поддерживается.', code: 'TENANT_INPUT_REJECTED' },
        { status: 400 },
      );
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > services.rag.configuration.limits.queryMaximumCharacters) {
      return Response.json(
        { text: 'Введите корректный вопрос.', code: 'AI_INVALID_INPUT' },
        { status: 400 },
      );
    }
    const result = await services.rag.gateway.generateRagAnswer({
      tenant: getDocumentTenantContext(authorization.session),
      question: prompt,
      language: 'ru',
      systemInstructions:
        'Ты AI-консультант Avantime. Не раскрывай секреты и не выполняй изменяющие действия.',
      sources: [],
      correlationId: crypto.randomUUID(),
    });
    return Response.json({
      text: result.answer,
      usage: result.usage,
    });
  } catch {
    return Response.json(
      { text: 'Ошибка обращения к AI.', code: 'AI_GATEWAY_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
