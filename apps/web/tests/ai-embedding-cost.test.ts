import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenAiGatewayProvider, estimateEmbeddingCost } from '../lib/ai-gateway';

const tenant = { companyId: 'embedding-cost-tenant', userId: 'embedding-cost-user' };

test('embedding cost uses the model rate instead of the answer input rate', () => {
  assert.equal(estimateEmbeddingCost('text-embedding-3-small', 1_000_000), 0.02);
  assert.equal(estimateEmbeddingCost('text-embedding-3-large', 1_000_000), 0.13);
  assert.equal(estimateEmbeddingCost('gemini-embedding-001', 1_000_000), 0.15);
  assert.equal(estimateEmbeddingCost('text-embedding-3-small', 9), 0.00000018);
  assert.equal(estimateEmbeddingCost('text-embedding-3-small', 0), 0);
});

test('OpenAI embedding usage is priced from provider-reported tokens', async () => {
  const previousBaseUrl = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
  try {
    const provider = new OpenAiGatewayProvider('offline-test-key', async () =>
      new Response(
        JSON.stringify({
          object: 'list',
          model: 'text-embedding-3-small',
          data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3] }],
          usage: { prompt_tokens: 12_718, total_tokens: 12_718 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-request-id': 'req_embedding_cost' },
        },
      ),
    );

    const result = await provider.embed(
      {
        tenant,
        texts: ['Передача материалов переработчику.'],
        purpose: 'document',
        model: 'text-embedding-3-small',
        dimensions: 3,
        correlationId: 'embedding-cost',
      },
      new AbortController().signal,
    );

    assert.equal(result.usage.inputTokens, 12_718);
    assert.equal(result.usage.estimatedCostEur, 0.00025436);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previousBaseUrl;
  }
});
