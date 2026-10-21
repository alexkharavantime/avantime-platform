import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DefaultAiGateway,
  DeterministicFakeAiProvider,
  OpenAiGatewayProvider,
} from '../lib/ai-gateway';
import { InMemoryAiOperationalEventSink } from '../lib/ai-observability';
import { loadRagConfiguration } from '../lib/rag-configuration';

const tenant = { companyId: 'reasoning-tenant', userId: 'reasoning-user' };

async function capturedAnswerPayload(environment: Record<string, string>) {
  const configuration = loadRagConfiguration({
    NODE_ENV: 'test',
    DOCUMENT_EMBEDDING_DRIVER: 'fake',
    RAG_ANSWER_DRIVER: 'openai',
    OPENAI_API_KEY: 'offline-test-key',
    AI_DAILY_BUDGET_EUR: '1',
    AI_MONTHLY_BUDGET_EUR: '1',
    AI_RATE_LIMIT_PER_MINUTE: '100',
    AI_PROVIDER_MAX_ATTEMPTS: '1',
    ...environment,
  });
  const previousBaseUrl = process.env.OPENAI_BASE_URL;
  const previousDiagnosticMode = process.env.BROWSER_REAL_AI_DIAGNOSTIC_MODE;
  process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
  delete process.env.BROWSER_REAL_AI_DIAGNOSTIC_MODE;
  let payload: Record<string, unknown> | undefined;
  try {
    const provider = new OpenAiGatewayProvider('offline-test-key', async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      payload = (await request.clone().json()) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          id: 'resp_offline_reasoning',
          object: 'response',
          created_at: 1,
          model: 'gpt-5-mini',
          status: 'completed',
          output: [
            {
              id: 'msg_offline_reasoning',
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', annotations: [], text: 'Ответ [S1].' }],
            },
          ],
          usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-request-id': 'req_reasoning' },
        },
      );
    });
    const gateway = new DefaultAiGateway(
      configuration,
      new DeterministicFakeAiProvider(),
      provider,
      new InMemoryAiOperationalEventSink(),
    );
    await gateway.generateRagAnswer({
      tenant,
      question: 'Какой документ?',
      language: 'ru',
      systemInstructions: 'Answer from sources.',
      sources: [
        {
          sourceId: 'S1',
          sourceType: 'DOCUMENT',
          documentId: 'document-1',
          chunkId: 'chunk-1',
          title: 'document.pdf',
          pageStart: 1,
          pageEnd: 1,
          text: 'Документ оформляет выпуск.',
        },
      ],
      correlationId: `reasoning-${environment.RAG_REASONING_EFFORT ?? 'default'}`,
    });
  } finally {
    if (previousBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previousBaseUrl;
    if (previousDiagnosticMode !== undefined) {
      process.env.BROWSER_REAL_AI_DIAGNOSTIC_MODE = previousDiagnosticMode;
    }
  }
  return payload;
}

test('configured RAG reasoning effort is sent to the OpenAI Responses API', async () => {
  const payload = await capturedAnswerPayload({ RAG_REASONING_EFFORT: 'low' });

  assert.deepEqual(payload?.reasoning, { effort: 'low' });
  assert.equal(payload?.model, 'gpt-5-mini');
  assert.equal(payload?.max_output_tokens, 1_000);
});

test('without configured reasoning effort the provider default is preserved', async () => {
  const payload = await capturedAnswerPayload({});

  assert.equal(payload?.reasoning, undefined);
  assert.equal(payload?.max_output_tokens, 1_000);
});
