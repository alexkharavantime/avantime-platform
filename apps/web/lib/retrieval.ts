import type { AiGateway } from './ai-gateway';
import type { AiOperationalEventSink } from './ai-observability';
import { NoopAiOperationalEventSink } from './ai-observability';
import type { DocumentTenantContext } from './document-model';
import type { DocumentType } from './document-intelligence-model';
import type {
  DocumentMetadataRepository,
  DocumentProcessingRepository,
} from './document-repositories';
import type { RagConfiguration } from './rag-configuration';
import type { VectorRepository } from './vector-repository';

export type RetrievalMode = 'lexical' | 'semantic' | 'hybrid';

export type RetrievalFilters = {
  documentTypes?: readonly DocumentType[];
  createdFrom?: string;
  createdTo?: string;
};

export type RetrievalRequest = {
  tenant: DocumentTenantContext;
  query: string;
  topK?: number;
  filters?: RetrievalFilters;
  correlationId: string;
};

export type RetrievalScoreComponents = {
  lexical: number;
  semantic: number;
  hybrid: number;
};
export type RetrievalSourceType = 'DOCUMENT' | 'ARTICLE';

export type RetrievalResult = {
  /**
   * Унифицированный тип источника результата.
   *
   * DOCUMENT — загруженный документ организации.
   * ARTICLE — статья Knowledge Hub.
   */
  sourceType: RetrievalSourceType;

  /**
   * Унифицированный идентификатор источника.
   *
   * Для DOCUMENT равен documentId.
   * Для ARTICLE равен articleId.
   */
  sourceId: string;

  /**
   * Унифицированное название источника для интерфейса и citations.
   *
   * Для DOCUMENT обычно используется originalName.
   * Для ARTICLE используется title статьи.
   */
  sourceTitle: string;

  /**
   * Поля обратной совместимости для существующего document retrieval.
   *
   * После добавления ARTICLE старые обработчики смогут продолжить
   * использовать documentId и documentTitle без немедленной миграции.
   */
  documentId?: string;
  documentTitle?: string;

  /**
   * Идентификатор статьи Knowledge Hub.
   * Заполняется только для sourceType === 'ARTICLE'.
   */
  articleId?: string;

  /**
   * Идентификатор индексируемого фрагмента источника.
   *
   * Для документов это существующий document chunk id.
   * Для статей может использоваться articleId или отдельный стабильный
   * идентификатор фрагмента, если статьи позднее будут разбиваться на части.
   */
  chunkId: string;

  /**
   * Порядковый номер фрагмента внутри источника.
   */
  chunkIndex: number;

  /**
   * Страницы исходного документа.
   *
   * Для статей значения остаются null.
   */
  pageStart: number | null;
  pageEnd: number | null;

  /**
   * Безопасный текстовый фрагмент, предназначенный для:
   *
   * - контекста RAG;
   * - предварительного просмотра;
   * - построения citations.
   *
   * Здесь не должны находиться секреты или необработанный служебный контент.
   */
  preview: string;

  /**
   * Итоговая оценка релевантности от 0 до 1.
   */
  score: number;

  /**
   * Компоненты итоговой оценки.
   *
   * Для lexical retrieval semantic равен 0.
   * Для semantic retrieval lexical равен 0.
   * Для hybrid retrieval заполняются все компоненты.
   */
  scoreComponents: {
    lexical: number;
    semantic: number;
    hybrid: number;
  };
};
export interface LexicalRetriever {
  retrieve(request: RetrievalRequest): Promise<RetrievalResult[]>;
}

export interface SemanticRetriever {
  retrieve(request: RetrievalRequest): Promise<RetrievalResult[]>;
}

export interface AdditionalSemanticSource {
  retrieveWithEmbedding(
    request: RetrievalRequest,
    embedding: {
      vector: readonly number[];
      model: string;
      dimensions: number;
      version: string;
    },
  ): Promise<RetrievalResult[]>;
}

export interface AdditionalSemanticSource {
  retrieveWithEmbedding(
    request: RetrievalRequest,
    embedding: {
      vector: readonly number[];
      model: string;
      dimensions: number;
      version: string;
    },
  ): Promise<RetrievalResult[]>;
}

export interface HybridRetriever {
  retrieve(request: RetrievalRequest): Promise<RetrievalResult[]>;
}

export class RetrievalInputError extends Error {
  readonly code = 'RETRIEVAL_INVALID_INPUT';
}

function normalizeText(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('und')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 2)
    .slice(0, 100);
}

function countOccurrences(source: string, query: string) {
  if (!query) return 0;
  let count = 0;
  let position = 0;
  while (position < source.length) {
    const index = source.indexOf(query, position);
    if (index < 0) break;
    count += 1;
    position = index + Math.max(1, query.length);
  }
  return count;
}

function lexicalScore(text: string, query: string) {
  const normalizedText = normalizeText(text);
  const normalizedQuery = normalizeText(query);
  const tokens = [...new Set(tokenize(query))];
  const exactMatches = countOccurrences(normalizedText, normalizedQuery);
  const tokenMatches = tokens.reduce(
    (total, token) => total + countOccurrences(normalizedText, token),
    0,
  );
  const coverage =
    tokens.length > 0
      ? tokens.filter((token) => normalizedText.includes(token)).length / tokens.length
      : 0;
  const phrase = exactMatches > 0 ? 1 : 0;
  const frequency = Math.min(1, (exactMatches * 2 + tokenMatches) / Math.max(3, tokens.length * 2));
  return Number((phrase * 0.35 + coverage * 0.45 + frequency * 0.2).toFixed(6));
}

function preview(text: string, query: string) {
  const normalized = text.toLocaleLowerCase('und');
  const terms = [normalizeText(query), ...tokenize(query)].filter(Boolean);
  const indices = terms.map((term) => normalized.indexOf(term)).filter((index) => index >= 0);
  const index = indices.length > 0 ? Math.min(...indices) : 0;
  const start = Math.max(0, index - 180);
  const end = Math.min(text.length, index + 420);
  const compact = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${compact}${end < text.length ? '…' : ''}`;
}

function parseOptionalDate(value: string | undefined, name: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RetrievalInputError(`${name} is invalid.`);
  return date;
}

function validateRequest(request: RetrievalRequest, configuration: RagConfiguration) {
  const query = request.query.trim();
  if (
    query.length < 2 ||
    query.length > configuration.limits.queryMaximumCharacters ||
    query.includes('\0')
  ) {
    throw new RetrievalInputError('Search query length is invalid.');
  }
  const topK = request.topK ?? configuration.hybrid.topK;
  if (!Number.isSafeInteger(topK) || topK <= 0 || topK > 100) {
    throw new RetrievalInputError('topK must be between 1 and 100.');
  }
  parseOptionalDate(request.filters?.createdFrom, 'createdFrom');
  parseOptionalDate(request.filters?.createdTo, 'createdTo');
  return { query, topK };
}

function matchesFilters(
  document: {
    detectedDocumentType: DocumentType;
    createdAt: string;
  },
  filters: RetrievalFilters | undefined,
) {
  if (
    filters?.documentTypes?.length &&
    !filters.documentTypes.includes(document.detectedDocumentType)
  ) {
    return false;
  }
  const created = new Date(document.createdAt);
  const from = parseOptionalDate(filters?.createdFrom, 'createdFrom');
  const to = parseOptionalDate(filters?.createdTo, 'createdTo');
  return (!from || created >= from) && (!to || created <= to);
}

export class DefaultLexicalRetriever implements LexicalRetriever {
  constructor(
    private readonly metadata: DocumentMetadataRepository,
    private readonly processing: DocumentProcessingRepository,
    private readonly configuration: RagConfiguration,
    private readonly events: AiOperationalEventSink = new NoopAiOperationalEventSink(),
  ) {}

  async retrieve(request: RetrievalRequest) {
    const { query, topK } = validateRequest(request, this.configuration);
    const results: RetrievalResult[] = [];
    const documents = await this.metadata.list(request.tenant);
    for (const document of documents) {
      if (
        document.status !== 'COMPLETED' ||
        document.deletedAt ||
        !matchesFilters(document, request.filters)
      ) {
        continue;
      }
      const chunks = await this.processing.readChunks(request.tenant, document.id);
      for (const chunk of chunks) {
        const score = lexicalScore(chunk.text, query);
        if (score <= 0) continue;
        results.push({
          sourceType: 'DOCUMENT',
          sourceId: document.id,
          sourceTitle: document.originalName,

          documentId: document.id,
          documentTitle: document.originalName,

          chunkId: chunk.id,
          chunkIndex: chunk.index,
          pageStart: null,
          pageEnd: null,
          preview: preview(chunk.text, query),
          score,
          scoreComponents: {
            lexical: score,
            semantic: 0,
            hybrid: score,
          },
        });
        
      }
    }
    const selected = results
      .sort(
        (first, second) =>
          second.score - first.score ||
          first.sourceId.localeCompare(second.sourceId)||
          first.chunkIndex - second.chunkIndex,
      )
      .slice(0, topK);
    this.events.record({
      name: 'retrieval_query',
      occurredAt: new Date().toISOString(),
      companyId: request.tenant.companyId,
      correlationId: request.correlationId,
      outcome: 'success',
      count: selected.length,
    });
    return selected;
  }
}

export class DefaultSemanticRetriever implements SemanticRetriever {
  constructor(
  private readonly gateway: AiGateway,
  private readonly vectors: VectorRepository,
  private readonly configuration: RagConfiguration,
  private readonly events: AiOperationalEventSink = new NoopAiOperationalEventSink(),
  private readonly additionalSources: readonly AdditionalSemanticSource[] = [],
) {}
  async retrieve(request: RetrievalRequest) {
    const { query, topK } = validateRequest(request, this.configuration);
    const embedding = await this.gateway.createQueryEmbedding({
      tenant: request.tenant,
      query,
      correlationId: request.correlationId,
    });
    if (
      embedding.model !== this.configuration.embedding.model ||
      embedding.dimensions !== this.configuration.embedding.dimensions
    ) {
      throw new Error('Query embedding is incompatible with the active vector index.');
    }

    const [results, additionalBatches] = await Promise.all([
      this.vectors.search({
        tenant: request.tenant,
        vector: embedding.vectors[0],
        embeddingModel: this.configuration.embedding.model,
        embeddingVersion: this.configuration.embedding.version,
        dimensions: this.configuration.embedding.dimensions,
        topK,
        minimumSimilarity:
          this.configuration.hybrid.semanticSimilarityThreshold,
        filters: request.filters,
      }),

  Promise.all(
    this.additionalSources.map((source) =>
      source.retrieveWithEmbedding(request, {
        vector: embedding.vectors[0],
        model: this.configuration.embedding.model,
        dimensions: this.configuration.embedding.dimensions,
        version: this.configuration.embedding.version,
      }),
    ),
  ),
]);

    const selected: RetrievalResult[] = results.map((result) => ({
      sourceType: 'DOCUMENT',
      sourceId: result.documentId,
      sourceTitle: result.documentTitle,

      documentId: result.documentId,
      documentTitle: result.documentTitle,

      chunkId: result.chunkId,
      chunkIndex: result.chunkIndex,
      pageStart: result.pageStart,
      pageEnd: result.pageEnd,
      preview: result.contentPreview,
      score: Number(Math.max(0, Math.min(1, result.score)).toFixed(6)),
      scoreComponents: {
        lexical: 0,
        semantic: Number(Math.max(0, Math.min(1, result.score)).toFixed(6)),
        hybrid: Number(Math.max(0, Math.min(1, result.score)).toFixed(6)),
      },
    }));

    const combined: RetrievalResult[] = [
  ...selected,
  ...additionalBatches.flat(),
]
  .sort(
    (first, second) =>
      second.score - first.score ||
      first.sourceType.localeCompare(second.sourceType) ||
      first.sourceId.localeCompare(second.sourceId) ||
      first.chunkIndex - second.chunkIndex,
  )
  .slice(0, topK);

    this.events.record({
      name: 'retrieval_query',
      occurredAt: new Date().toISOString(),
      companyId: request.tenant.companyId,
      correlationId: request.correlationId,
      outcome: 'success',
      count: combined.length,
      inputTokens: embedding.usage.inputTokens,
      estimatedCostEur: embedding.usage.estimatedCostEur,
    });
    return combined;
  }
}

export class DefaultHybridRetriever implements HybridRetriever {
  constructor(
    private readonly lexical: LexicalRetriever,
    private readonly semantic: SemanticRetriever,
    private readonly configuration: RagConfiguration,
  ) {}

  async retrieve(request: RetrievalRequest) {
    const { topK } = validateRequest(request, this.configuration);
    const candidateLimit = Math.min(100, Math.max(topK * 3, topK));
    const [lexical, semantic] = await Promise.all([
      this.lexical.retrieve({ ...request, topK: candidateLimit }),
      this.semantic.retrieve({ ...request, topK: candidateLimit }),
    ]);
    const lexicalMaximum = Math.max(0, ...lexical.map((result) => result.score));
    const semanticMaximum = Math.max(0, ...semantic.map((result) => result.score));
    const combined = new Map<
      string,
      RetrievalResult & {
        lexicalNormalized: number;
        semanticNormalized: number;
      }
    >();
    for (const result of lexical) {
      const key = `${result.sourceType}:${result.sourceId}:${result.chunkId}`;
      combined.set(key, {
        ...result,
        lexicalNormalized: lexicalMaximum > 0 ? result.score / lexicalMaximum : 0,
        semanticNormalized: 0,
      });
    }
    for (const result of semantic) {
      const key = `${result.sourceType}:${result.sourceId}:${result.chunkId}`;
      const existing = combined.get(key);
      combined.set(key, {
        ...(existing ?? result),
        documentTitle: result.documentTitle || existing?.documentTitle || '',
        preview: existing?.preview || result.preview,
        pageStart: result.pageStart ?? existing?.pageStart ?? null,
        pageEnd: result.pageEnd ?? existing?.pageEnd ?? null,
        lexicalNormalized: existing?.lexicalNormalized ?? 0,
        semanticNormalized: semanticMaximum > 0 ? result.score / semanticMaximum : 0,
      });
    }
    const weightTotal =
      this.configuration.hybrid.lexicalWeight + this.configuration.hybrid.semanticWeight;
    const ranked = [...combined.values()]
      .map((result) => {
        const hybrid =
          (result.lexicalNormalized * this.configuration.hybrid.lexicalWeight +
            result.semanticNormalized * this.configuration.hybrid.semanticWeight) /
          weightTotal;
        return {
          ...result,
          score: Number(hybrid.toFixed(6)),
          scoreComponents: {
            lexical: Number(result.lexicalNormalized.toFixed(6)),
            semantic: Number(result.semanticNormalized.toFixed(6)),
            hybrid: Number(hybrid.toFixed(6)),
          },
        };
      })
      .filter((result) => result.score >= this.configuration.hybrid.minimumScore)
      .sort(
        (first, second) =>
          second.score - first.score ||
          second.scoreComponents.semantic - first.scoreComponents.semantic ||
          first.sourceId.localeCompare(second.sourceId) ||
          first.chunkIndex - second.chunkIndex,
      );
    const perSource = new Map<string, number>();
    const selected: RetrievalResult[] = [];
    for (const result of ranked) {
      const count = perSource.get(result.sourceId) ?? 0;
      if (count >= this.configuration.hybrid.maximumChunksPerDocument) continue;
      selected.push(result);
      perSource.set(result.sourceId, count + 1);
      if (selected.length >= topK) break;
    }
    return selected;
  }
}
