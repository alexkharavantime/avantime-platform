import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export type AiOperationalEventName =
  | 'embedding_job_queued'
  | 'embedding_job_completed'
  | 'embedding_job_failed'
  | 'chunks_embedded'
  | 'provider_call'
  | 'retrieval_query'
  | 'retrieval_trace'
  | 'rag_context'
  | 'rag_request';

export type RetrievalTraceCandidate = {
  sourceType: 'DOCUMENT' | 'ARTICLE';
  sourceId: string;
  documentId?: string;
  articleId?: string;
  chunkId: string;
  chunkIndex: number;
  pageStart: number | null;
  pageEnd: number | null;
  lexicalScore: number;
  semanticScore: number;
  hybridScore: number;
  selected: boolean;
  exclusionReason?: 'below_minimum_score' | 'page_filter' | 'per_document_limit' | 'top_k_limit';
};

export type RetrievalTrace = {
  candidateLimit: number;
  lexicalCandidateCount: number;
  semanticCandidateCount: number;
  candidates: readonly RetrievalTraceCandidate[];
};

export type ContextTraceSource = {
  sourceId: string;
  sourceType: 'DOCUMENT' | 'ARTICLE';
  documentId?: string;
  articleId?: string;
  chunkId: string;
  pageStart: number | null;
  pageEnd: number | null;
  sourceCharacters: number;
  displayCharacters: number;
  contextCharacters: number;
  displayTruncated: boolean;
  contextTruncated: boolean;
  exclusionReason?: 'context_budget' | 'source_validation';
  sourceText?: string;
};

export type ContextTrace = {
  maximumContextCharacters: number;
  contextCharacters: number;
  sources: readonly ContextTraceSource[];
};

export type AiProviderDiagnostic = {
  provider: 'openai' | 'gemini' | 'fake' | 'disabled' | 'unknown';
  operation: 'embedding' | 'answer';
  stage?: 'document_embedding' | 'query_embedding' | 'rag_answer';
  httpStatus?: number;
  providerErrorName?: string;
  providerErrorType?: string;
  providerErrorCode?: string;
  providerRequestId?: string;
  responseStatus?: string;
  responseErrorType?: string;
  responseErrorCode?: string;
  incompleteReason?: string;
  attemptCount?: number;
};

export type AiOperationalEvent = {
  name: AiOperationalEventName;
  occurredAt: string;
  companyId: string;
  correlationId: string;
  outcome: 'success' | 'failure' | 'no_answer';
  durationMs?: number;
  attemptCount?: number;
  count?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostEur?: number;
  actualCostEur?: number | null;
  reservedCostEur?: number;
  errorCode?: string;
  providerDiagnostic?: AiProviderDiagnostic;
  retrievalTrace?: RetrievalTrace;
  contextTrace?: ContextTrace;
};

export interface AiOperationalEventSink {
  readonly includeRetrievedText?: boolean;
  record(event: AiOperationalEvent): void;
}

function safeToken(value: unknown, maximumLength = 128) {
  return typeof value === 'string' &&
    value.length <= maximumLength &&
    /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value)
    ? value
    : undefined;
}

function safeProviderDiagnostic(diagnostic: AiProviderDiagnostic) {
  return {
    provider: diagnostic.provider,
    operation: diagnostic.operation,
    ...(diagnostic.stage ? { stage: diagnostic.stage } : {}),
    ...(Number.isSafeInteger(diagnostic.httpStatus) ? { httpStatus: diagnostic.httpStatus } : {}),
    ...(
      [
        'providerErrorName',
        'providerErrorType',
        'providerErrorCode',
        'providerRequestId',
        'responseStatus',
        'responseErrorType',
        'responseErrorCode',
        'incompleteReason',
      ] as const
    ).reduce<Record<string, string>>((safe, key) => {
      const token = safeToken(diagnostic[key]);
      if (token) safe[key] = token;
      return safe;
    }, {}),
    ...(Number.isSafeInteger(diagnostic.attemptCount) && diagnostic.attemptCount! > 0
      ? { attemptCount: diagnostic.attemptCount }
      : {}),
  };
}

function safeRetrievalTrace(trace: RetrievalTrace) {
  return {
    candidateLimit: trace.candidateLimit,
    lexicalCandidateCount: trace.lexicalCandidateCount,
    semanticCandidateCount: trace.semanticCandidateCount,
    candidates: trace.candidates.flatMap((candidate) => {
      const sourceId = safeToken(candidate.sourceId);
      const chunkId = safeToken(candidate.chunkId);
      if (!sourceId || !chunkId) return [];
      return [{
        sourceType: candidate.sourceType,
        sourceId,
        ...(safeToken(candidate.documentId) ? { documentId: safeToken(candidate.documentId) } : {}),
        ...(safeToken(candidate.articleId) ? { articleId: safeToken(candidate.articleId) } : {}),
        chunkId,
        chunkIndex: candidate.chunkIndex,
        pageStart: candidate.pageStart,
        pageEnd: candidate.pageEnd,
        lexicalScore: candidate.lexicalScore,
        semanticScore: candidate.semanticScore,
        hybridScore: candidate.hybridScore,
        selected: candidate.selected,
        ...(candidate.exclusionReason ? { exclusionReason: candidate.exclusionReason } : {}),
      }];
    }),
  };
}

function safeContextTrace(trace: ContextTrace, includeRetrievedText: boolean) {
  return {
    maximumContextCharacters: trace.maximumContextCharacters,
    contextCharacters: trace.contextCharacters,
    sources: trace.sources.flatMap((source) => {
      const sourceId = safeToken(source.sourceId);
      const chunkId = safeToken(source.chunkId);
      if (!sourceId || !chunkId) return [];
      return [{
        sourceId,
        sourceType: source.sourceType,
        ...(safeToken(source.documentId) ? { documentId: safeToken(source.documentId) } : {}),
        ...(safeToken(source.articleId) ? { articleId: safeToken(source.articleId) } : {}),
        chunkId,
        pageStart: source.pageStart,
        pageEnd: source.pageEnd,
        sourceCharacters: source.sourceCharacters,
        displayCharacters: source.displayCharacters,
        contextCharacters: source.contextCharacters,
        displayTruncated: source.displayTruncated,
        contextTruncated: source.contextTruncated,
        ...(source.exclusionReason ? { exclusionReason: source.exclusionReason } : {}),
        ...(includeRetrievedText && typeof source.sourceText === 'string'
          ? { sourceText: source.sourceText }
          : {}),
      }];
    }),
  };
}

export class JsonlAiOperationalEventSink implements AiOperationalEventSink {
  constructor(
    private readonly outputPath: string,
    readonly includeRetrievedText = false,
  ) {}

  record(event: AiOperationalEvent) {
    const safeEvent = {
      name: event.name,
      occurredAt: event.occurredAt,
      ...(safeToken(event.companyId) ? { companyId: event.companyId } : {}),
      ...(safeToken(event.correlationId) ? { correlationId: event.correlationId } : {}),
      outcome: event.outcome,
      ...(Number.isFinite(event.durationMs) ? { durationMs: event.durationMs } : {}),
      ...(Number.isSafeInteger(event.attemptCount) && event.attemptCount! > 0
        ? { attemptCount: event.attemptCount }
        : {}),
      ...(Number.isSafeInteger(event.inputTokens) ? { inputTokens: event.inputTokens } : {}),
      ...(Number.isSafeInteger(event.outputTokens) ? { outputTokens: event.outputTokens } : {}),
      ...(Number.isFinite(event.estimatedCostEur) && event.estimatedCostEur! >= 0
        ? { estimatedCostEur: event.estimatedCostEur }
        : {}),
      ...(event.actualCostEur === null
        ? { actualCostEur: null }
        : Number.isFinite(event.actualCostEur) && event.actualCostEur! >= 0
          ? { actualCostEur: event.actualCostEur }
          : {}),
      ...(Number.isFinite(event.reservedCostEur) && event.reservedCostEur! >= 0
        ? { reservedCostEur: event.reservedCostEur }
        : {}),
      ...(safeToken(event.errorCode) ? { errorCode: event.errorCode } : {}),
      ...(event.providerDiagnostic
        ? { providerDiagnostic: safeProviderDiagnostic(event.providerDiagnostic) }
        : {}),
      ...(event.retrievalTrace
        ? { retrievalTrace: safeRetrievalTrace(event.retrievalTrace) }
        : {}),
      ...(event.contextTrace
        ? { contextTrace: safeContextTrace(event.contextTrace, this.includeRetrievedText) }
        : {}),
    };
    mkdirSync(path.dirname(this.outputPath), { recursive: true, mode: 0o700 });
    appendFileSync(this.outputPath, `${JSON.stringify(safeEvent)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
}

export class InMemoryAiOperationalEventSink implements AiOperationalEventSink {
  private readonly events: AiOperationalEvent[] = [];

  record(event: AiOperationalEvent) {
    this.events.push({ ...event });
  }

  list() {
    return this.events.map((event) => ({ ...event }));
  }

  summary() {
    return this.events.reduce(
      (summary, event) => {
        summary.events += 1;
        summary.estimatedCostEur += event.estimatedCostEur ?? 0;
        if (event.outcome === 'failure') summary.failures += 1;
        if (event.outcome === 'no_answer') summary.noAnswers += 1;
        if (event.name === 'chunks_embedded') summary.chunksEmbedded += event.count ?? 0;
        if (event.name === 'retrieval_query') summary.retrievalQueries += 1;
        if (event.name === 'rag_request') summary.ragRequests += 1;
        return summary;
      },
      {
        events: 0,
        failures: 0,
        chunksEmbedded: 0,
        retrievalQueries: 0,
        ragRequests: 0,
        noAnswers: 0,
        estimatedCostEur: 0,
      },
    );
  }
}

export class NoopAiOperationalEventSink implements AiOperationalEventSink {
  record(): void {}
}
