import { KnowledgeSemanticRetriever } from '../lib/knowledge-retrieval';

import { PostgreSQLKnowledgeVectorAdapter } from '../lib/knowledge-indexing';

import type {
  KnowledgeVectorSearchRequest,
  KnowledgeVectorSearchResult,
} from '../lib/knowledge-indexing';

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DefaultSemanticRetriever,
  type AdditionalSemanticSource,
  type RetrievalRequest,
  type RetrievalResult,
} from '../lib/retrieval';

import type { AiGateway } from '../lib/ai-gateway';
import type { VectorRepository } from '../lib/vector-repository';
import {
  loadRagConfiguration,
  type RagConfiguration,
} from '../lib/rag-configuration';

test('knowledge semantic source returns ARTICLE retrieval result', async () => {
  const source: AdditionalSemanticSource = {
    async retrieveWithEmbedding(
      request,
      embedding,
    ): Promise<RetrievalResult[]> {
      assert.equal(request.tenant.companyId, 'tenant-a');
      assert.equal(embedding.model, 'deterministic-test-v1');
      assert.equal(embedding.version, 'test-v1');
      assert.equal(embedding.dimensions, 16);
      assert.equal(embedding.vector.length, 16);

      return [
        {
          sourceType: 'ARTICLE',
          sourceId: 'article-1',
          sourceTitle: 'Knowledge article 1',
          articleId: 'article-1',

          chunkId: 'article-1:article',
          chunkIndex: 0,
          pageStart: null,
          pageEnd: null,

          preview: 'Semantic Knowledge Hub result',
          score: 0.91,

          scoreComponents: {
            lexical: 0,
            semantic: 0.91,
            hybrid: 0.91,
          },
        },
      ];
    },
  };

  const request = {
    tenant: {
      companyId: 'tenant-a',
    },
    query: 'knowledge search',
    correlationId: 'knowledge-semantic-test',
    topK: 5,
  } as RetrievalRequest;

  const results = await source.retrieveWithEmbedding(request, {
    vector: Array.from({ length: 16 }, () => 0.1),
    model: 'deterministic-test-v1',
    dimensions: 16,
    version: 'test-v1',
  });

  assert.equal(results.length, 1);

  const result = results[0];

  assert.equal(result.sourceType, 'ARTICLE');
  assert.equal(result.sourceId, 'article-1');
  assert.equal(result.articleId, 'article-1');
  assert.equal(result.documentId, undefined);
  assert.equal(result.chunkId, 'article-1:article');
  assert.equal(result.score, 0.91);
  assert.equal(result.scoreComponents.semantic, 0.91);
});

test('default semantic retriever combines DOCUMENT and ARTICLE with one query embedding', async () => {
  let embeddingCalls = 0;

  const gateway = {
    async createQueryEmbedding() {
      embeddingCalls += 1;

      return {
        vectors: [Array.from({ length: 16 }, () => 0.1)],
        model: 'deterministic-test-v1',
        dimensions: 16,
        usage: {
          inputTokens: 1,
          outputTokens: 0,
          estimatedCostEur: 0,
        },
      };
    },
  } as unknown as AiGateway;

  const vectors = {
    async search() {
      return [
        {
          documentId: 'document-1',
          documentTitle: 'Document 1',
          chunkId: 'document-1:chunk-1',
          chunkIndex: 0,
          pageStart: 1,
          pageEnd: 1,
          contentPreview: 'Document semantic result',
          score: 0.82,
        },
      ];
    },
  } as unknown as VectorRepository;

  const knowledgeSource: AdditionalSemanticSource = {
    async retrieveWithEmbedding(
      request,
      embedding,
    ): Promise<RetrievalResult[]> {
      assert.equal(request.query, 'shared semantic query');
      assert.equal(embedding.model, 'deterministic-test-v1');
      assert.equal(embedding.version, 'test-v1');
      assert.equal(embedding.dimensions, 16);
      assert.equal(embedding.vector.length, 16);

      return [
        {
          sourceType: 'ARTICLE',
          sourceId: 'article-1',
          sourceTitle: 'Article 1',
          articleId: 'article-1',
          chunkId: 'article-1:article',
          chunkIndex: 0,
          pageStart: null,
          pageEnd: null,
          preview: 'Article semantic result',
          score: 0.91,
          scoreComponents: {
            lexical: 0,
            semantic: 0.91,
            hybrid: 0.91,
          },
        },
      ];
    },
  };

  const configuration = loadRagConfiguration({
  NODE_ENV: 'test',
  DOCUMENT_EMBEDDING_DRIVER: 'fake',
  DOCUMENT_EMBEDDING_MODEL: 'deterministic-test-v1',
  DOCUMENT_EMBEDDING_DIMENSIONS: '16',
  DOCUMENT_EMBEDDING_VERSION: 'test-v1',
  DOCUMENT_VECTOR_DRIVER: 'memory',
  DOCUMENT_EMBEDDING_QUEUE_DRIVER: 'local',
  RAG_ANSWER_DRIVER: 'fake',
  HYBRID_MIN_SCORE: '0',
  SEMANTIC_SIMILARITY_THRESHOLD: '0',
  AI_RATE_LIMIT_PER_MINUTE: '1000',
});

  const semantic = new DefaultSemanticRetriever(
    gateway,
    vectors,
    configuration,
    undefined,
    [knowledgeSource],
  );

  const request = {
    tenant: {
      companyId: 'tenant-a',
    },
    query: 'shared semantic query',
    correlationId: 'shared-semantic-test',
    topK: 5,
  } as RetrievalRequest;

  const results = await semantic.retrieve(request);

  assert.equal(embeddingCalls, 1);
  assert.equal(results.length, 2);

  assert.equal(results[0].sourceType, 'ARTICLE');
  assert.equal(results[0].sourceId, 'article-1');
  assert.equal(results[0].score, 0.91);

  assert.equal(results[1].sourceType, 'DOCUMENT');
  assert.equal(results[1].sourceId, 'document-1');
  assert.equal(results[1].score, 0.82);
});

test('KnowledgeSemanticRetriever maps vector result to ARTICLE retrieval result', async () => {
  let capturedRequest: KnowledgeVectorSearchRequest | undefined;

  const vectorResult: KnowledgeVectorSearchResult = {
    articleId: 'article-1',
    slug: 'article-1',
    sourceVersion: 3,
    generation: 3,
    ownerScope: 'ORGANIZATION',
    companyId: 'tenant-a',
    visibility: 'ORGANIZATION',
    lifecycleStatus: 'PUBLISHED',
    title: 'Semantic Knowledge Article',
    summary: 'Knowledge article summary',
    tags: ['rag', 'knowledge'],
    score: 0.93,
  };

  const vectors = {
    async search(request: KnowledgeVectorSearchRequest) {
      capturedRequest = request;
      return [vectorResult];
    },
  } as unknown as PostgreSQLKnowledgeVectorAdapter;

  const configuration = {
    embedding: {
      model: 'deterministic-test-v1',
      version: 'test-v1',
      dimensions: 16,
    },
    hybrid: {
      topK: 5,
      semanticSimilarityThreshold: 0.25,
    },
  } as RagConfiguration;

  const retriever = new KnowledgeSemanticRetriever(
    vectors,
    configuration,
  );

  const request = {
    tenant: {
      companyId: 'tenant-a',
    },
    query: 'semantic knowledge',
    correlationId: 'knowledge-semantic-direct-test',
    topK: 3,
  } as RetrievalRequest;

  const results = await retriever.retrieveWithEmbedding(
    request,
    {
      vector: Array.from({ length: 16 }, () => 0.1),
      model: 'deterministic-test-v1',
      dimensions: 16,
      version: 'test-v1',
    },
  );

  assert.ok(capturedRequest);

  assert.deepEqual(capturedRequest.audience, {
    kind: 'ORGANIZATION',
    companyId: 'tenant-a',
  });

  assert.equal(
    capturedRequest.embeddingModel,
    'deterministic-test-v1',
  );
  assert.equal(capturedRequest.embeddingVersion, 'test-v1');
  assert.equal(capturedRequest.topK, 3);
  assert.equal(capturedRequest.minimumSimilarity, 0.25);
  assert.equal(capturedRequest.vector.length, 16);

  assert.equal(results.length, 1);

  const result = results[0];

  assert.equal(result.sourceType, 'ARTICLE');
  assert.equal(result.sourceId, 'article-1');
  assert.equal(result.sourceTitle, 'Semantic Knowledge Article');
  assert.equal(result.articleId, 'article-1');

  assert.equal(result.documentId, undefined);

  assert.equal(result.chunkId, 'article-1:article');
  assert.equal(result.chunkIndex, 0);
  assert.equal(result.pageStart, null);
  assert.equal(result.pageEnd, null);

  assert.equal(result.preview, 'Knowledge article summary');
  assert.equal(result.score, 0.93);

  assert.deepEqual(result.scoreComponents, {
    lexical: 0,
    semantic: 0.93,
    hybrid: 0.93,
  });
});

test('PostgreSQLKnowledgeVectorAdapter enforces organization security filters', async () => {
  const globalWithPrisma = globalThis as typeof globalThis & {
    avantimePrismaClient?: unknown;
  };

  const previousPrisma = globalWithPrisma.avantimePrismaClient;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  let capturedSql = '';
  let capturedValues: unknown[] = [];

  const fakePrisma = {
    async $queryRawUnsafe(sql: string, ...values: unknown[]) {
      capturedSql = sql;
      capturedValues = values;

      return [
        {
          articleId: 'article-1',
          sourceVersion: 3,
          generation: 3,
          ownerScope: 'ORGANIZATION',
          companyId: 'tenant-a',
          visibility: 'ORGANIZATION',
          lifecycleStatus: 'PUBLISHED',
          title: 'Allowed article',
          summary: 'Allowed summary',
          tags: ['knowledge'],
          score: 0.93,
        },
      ];
    },
  };

  try {
    process.env.DATABASE_URL = 'postgresql://test-only';

    globalWithPrisma.avantimePrismaClient = fakePrisma;

    const adapter = new PostgreSQLKnowledgeVectorAdapter();

    const results = await adapter.search({
      audience: {
        kind: 'ORGANIZATION',
        companyId: 'tenant-a',
      },
      vector: Array.from({ length: 16 }, () => 0.1),
      embeddingModel: 'deterministic-test-v1',
      embeddingVersion: 'test-v1',
      topK: 5,
      minimumSimilarity: 0.25,
    });

    assert.equal(results.length, 1);

    assert.equal(results[0].articleId, 'article-1');
    assert.equal(results[0].companyId, 'tenant-a');

    assert.match(
      capturedSql,
      /v\."operationalStatus"\s*=\s*'READY'/,
    );

    assert.match(
      capturedSql,
      /v\."lifecycleStatus"\s*=\s*'PUBLISHED'/,
    );

    assert.match(
      capturedSql,
      /v\."visibility"\s*<>\s*'PRIVATE'/,
    );

    assert.match(
      capturedSql,
      /a\."status"\s*=\s*'PUBLISHED'/,
    );

    assert.match(
      capturedSql,
      /a\."quarantinedAt"\s+IS\s+NULL/,
    );

    assert.match(
      capturedSql,
      /v\."ownerScope"\s*=\s*'ORGANIZATION'/,
    );

    assert.match(
      capturedSql,
      /v\."companyId"\s*=\s*\$5/,
    );

    assert.match(
      capturedSql,
      /v\."ownerScope"\s*=\s*'PLATFORM'/,
    );

    assert.match(
      capturedSql,
      /1\s*-\s*\(v\."embedding"\s*<=>\s*\$1::vector\)\s*>=\s*\$4/,
    );

    assert.deepEqual(capturedValues.slice(1, 6), [
      'deterministic-test-v1',
      'test-v1',
      0.25,
      'tenant-a',
      5,
    ]);
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    if (previousPrisma === undefined) {
      delete globalWithPrisma.avantimePrismaClient;
    } else {
      globalWithPrisma.avantimePrismaClient = previousPrisma;
    }
  }
});