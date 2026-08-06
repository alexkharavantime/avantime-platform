import type {
  LexicalRetriever,
  RetrievalRequest,
  RetrievalResult,
} from './retrieval';

import {
  PostgreSQLKnowledgeSearchAdapter,
  type KnowledgeIndexAudience,
  type KnowledgeIndexDocument,
} from './knowledge-indexing';

function toAudience(request: RetrievalRequest): KnowledgeIndexAudience {
  return {
    kind: 'ORGANIZATION',
    companyId: request.tenant.companyId,
  };
}

function preview(document: KnowledgeIndexDocument): string {
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