import type { AiGateway } from './ai-gateway';
import type { RagConfiguration } from './rag-configuration';
import type {
  LexicalRetriever,
  RetrievalRequest,
  RetrievalResult,
  SemanticRetriever,
} from './retrieval';

import {
  PostgreSQLKnowledgeSearchAdapter,
  PostgreSQLKnowledgeVectorAdapter,
  type KnowledgeIndexAudience,
  type KnowledgeIndexDocument,
} from './knowledge-indexing';

function toAudience(request: RetrievalRequest): KnowledgeIndexAudience {
  return {
    kind: 'ORGANIZATION',
    companyId: request.tenant.companyId,
  };
}

function preview(document: Pick<KnowledgeIndexDocument, 'summary' | 'searchText' | 'title'>): string {
  const value = document.summary || document.searchText || document.title;
  return value.replace(/\s+/g, ' ').trim().slice(0, 500);
}

export class KnowledgeLexicalRetriever implements LexicalRetriever {
  constructor(
    private readonly search: PostgreSQLKnowledgeSearchAdapter,
  ) {}

  async retrieve(
    request: RetrievalRequest,
  ): Promise<RetrievalResult[]> {
    const documents = await this.search.search(
      request.query,
      toAudience(request),
    );

    return documents
      .slice(0, request.topK)
      .map((document, index) => ({
        sourceType: 'ARTICLE',
        sourceId: document.articleId,
        sourceTitle: document.title,
        articleId: document.articleId,
        chunkId: `${document.articleId}:article`,
        chunkIndex: index,
        pageStart: null,
        pageEnd: null,
        preview: preview(document),
        score: 1,
        scoreComponents: {
          lexical: 1,
          semantic: 0,
          hybrid: 1,
        },
      }));
  }
}

export class CompositeLexicalRetriever implements LexicalRetriever {
  constructor(
    private readonly retrievers: readonly LexicalRetriever[],
  ) {}

  async retrieve(request: RetrievalRequest): Promise<RetrievalResult[]> {
    const batches = await Promise.all(
      this.retrievers.map((retriever) => retriever.retrieve(request)),
    );

    return batches
      .flat()
      .sort(
        (first, second) =>
          second.score - first.score ||
          first.sourceId.localeCompare(second.sourceId) ||
          first.chunkIndex - second.chunkIndex,
      )
      .slice(0, request.topK);
  }
}

export class KnowledgeSemanticRetriever implements SemanticRetriever {
  constructor(
    private readonly gateway: AiGateway,
    private readonly vectors: PostgreSQLKnowledgeVectorAdapter,
    private readonly configuration: RagConfiguration,
  ) {}

  async retrieve(request: RetrievalRequest): Promise<RetrievalResult[]> {
    const topK = request.topK ?? this.configuration.hybrid.topK;
    const query = request.query.trim();
    const embedding = await this.gateway.createQueryEmbedding({
      tenant: request.tenant,
      query,
      correlationId: request.correlationId,
    });

    if (
      embedding.model !== this.configuration.embedding.model ||
      embedding.dimensions !== this.configuration.embedding.dimensions
    ) {
      throw new Error('Query embedding is incompatible with the active knowledge vector index.');
    }

    const rows = await this.vectors.search({
      vector: embedding.vectors[0],
      model: this.configuration.embedding.model,
      embeddingVersion: this.configuration.embedding.version,
      audience: toAudience(request),
      topK,
      minimumSimilarity: this.configuration.hybrid.semanticSimilarityThreshold,
    });

    return rows.map((row, index) => {
      const score = Number(Math.max(0, Math.min(1, row.score)).toFixed(6));
      return {
        sourceType: 'ARTICLE',
        sourceId: row.articleId,
        sourceTitle: row.title,
        articleId: row.articleId,
        chunkId: `${row.articleId}:article`,
        chunkIndex: index,
        pageStart: null,
        pageEnd: null,
        preview: preview(row),
        score,
        scoreComponents: {
          lexical: 0,
          semantic: score,
          hybrid: score,
        },
      };
    });
  }
}

export class CompositeSemanticRetriever implements SemanticRetriever {
  constructor(
    private readonly retrievers: readonly SemanticRetriever[],
  ) {}

  async retrieve(request: RetrievalRequest): Promise<RetrievalResult[]> {
    const batches = await Promise.all(
      this.retrievers.map((retriever) => retriever.retrieve(request)),
    );

    return batches
      .flat()
      .sort(
        (first, second) =>
          second.score - first.score ||
          first.sourceId.localeCompare(second.sourceId) ||
          first.chunkIndex - second.chunkIndex,
      )
      .slice(0, request.topK);
  }
}
