import type {
  AdditionalSemanticSource,
  LexicalRetriever,
  RetrievalRequest,
  RetrievalResult,
} from './retrieval';

import {
  PostgreSQLKnowledgeSearchAdapter,
  PostgreSQLKnowledgeVectorAdapter,
  type KnowledgeIndexAudience,
  type KnowledgeIndexDocument,
} from './knowledge-indexing';


import type { RagConfiguration } from './rag-configuration';

function toAudience(request: RetrievalRequest): KnowledgeIndexAudience {
  return {
    kind: 'ORGANIZATION',
    companyId: request.tenant.companyId,
  };
}
function preview(
  document: Pick<KnowledgeIndexDocument, 'title' | 'summary'> & {
    searchText?: string;
  },
): string {

  const value =
    document.summary ||
    document.searchText ||
    document.title;

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
export class KnowledgeSemanticRetriever
  implements AdditionalSemanticSource
{
  constructor(
    private readonly vectors: PostgreSQLKnowledgeVectorAdapter,
    private readonly configuration: RagConfiguration,
  ) {}

  async retrieveWithEmbedding(
    request: RetrievalRequest,
    embedding: {
      vector: readonly number[];
      model: string;
      dimensions: number;
      version: string;
    },
  ): Promise<RetrievalResult[]> {
    if (
      embedding.model !== this.configuration.embedding.model ||
      embedding.dimensions !== this.configuration.embedding.dimensions ||
      embedding.version !== this.configuration.embedding.version
    ) {
      throw new Error(
        'Query embedding is incompatible with the active knowledge vector index.',
      );
    }

    const results = await this.vectors.search({
      audience: toAudience(request),
      vector: [...embedding.vector],
      embeddingModel: embedding.model,
      embeddingVersion: embedding.version,
      topK: request.topK ?? this.configuration.hybrid.topK,
      minimumSimilarity:
        this.configuration.hybrid.semanticSimilarityThreshold,
    });

    return results.map((result, index) => {
      const score = Number(
        Math.max(0, Math.min(1, result.score)).toFixed(6),
      );

      return {
        sourceType: 'ARTICLE',
        sourceId: result.articleId,
        sourceTitle: result.title,

        articleId: result.articleId,
        articleSlug: result.slug,

        chunkId: `${result.articleId}:article`,
        chunkIndex: index,
        pageStart: null,
        pageEnd: null,
        preview: preview(result),
        score,
        scoreComponents: {
          lexical: 0,
          semantic: score,
          hybrid: score,
        },
      };
    });
  }
}export class CompositeLexicalRetriever implements LexicalRetriever {
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