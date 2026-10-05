import { createHash } from 'node:crypto';

import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

import type { AiOperationalEventSink, AiProviderDiagnostic } from './ai-observability';
import { NoopAiOperationalEventSink } from './ai-observability';
import {
  MemoryAiCostController,
  MemoryAiRateLimiter,
  type AiBudgetReservation,
  type AiCostController,
  type AiRequestType,
  type DistributedAiRateLimiter,
} from './ai-control';
import type { DocumentTenantContext } from './document-model';
import type { AiProviderDriver, RagConfiguration } from './rag-configuration';

export type EmbeddingPurpose = 'document' | 'query';

export type EmbeddingRequest = {
  tenant: DocumentTenantContext;
  texts: readonly string[];
  model: string;
  dimensions: number;
  purpose: EmbeddingPurpose;
  correlationId: string;
  usageIdempotencyKey?: string;
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  estimatedCostEur: number;
};

export type EmbeddingResult = {
  vectors: number[][];
  model: string;
  dimensions: number;
  usage: AiUsage;
  providerDiagnostic?: AiProviderDiagnostic;
};

export type RagContextSource = {
  sourceId: string;
  sourceType: 'DOCUMENT' | 'ARTICLE';

  documentId?: string;
  articleId?: string;

  chunkId: string;
  title: string;
  excerpt: string;
};

export type RagGenerationRequest = {
  tenant: DocumentTenantContext;
  question: string;
  language: string;
  model: string;
  maximumOutputTokens: number;
  systemInstructions: string;
  sources: readonly RagContextSource[];
  correlationId: string;
};

export type RagGenerationResult = {
  answer: string;
  model: string;
  usage: AiUsage;
  providerDiagnostic?: AiProviderDiagnostic;
};

export type AiProviderAvailability = {
  configured: boolean;
  available: boolean;
  capabilities: {
    embeddings: boolean;
    answers: boolean;
  };
};

export interface EmbeddingProvider {
  readonly id: string;
  embed(request: EmbeddingRequest, signal: AbortSignal): Promise<EmbeddingResult>;
  checkAvailability(): Promise<AiProviderAvailability>;
}

export interface RagAnswerProvider {
  readonly id: string;
  generate(request: RagGenerationRequest, signal: AbortSignal): Promise<RagGenerationResult>;
  checkAvailability(): Promise<AiProviderAvailability>;
}

export type AiGatewayReadiness = {
  embedding: AiProviderAvailability;
  answer: AiProviderAvailability;
};

export interface AiGateway {
  createDocumentEmbeddings(
    request: Omit<EmbeddingRequest, 'model' | 'dimensions'>,
  ): Promise<EmbeddingResult>;
  createQueryEmbedding(
    request: Omit<EmbeddingRequest, 'model' | 'dimensions' | 'purpose' | 'texts'> & {
      query: string;
    },
  ): Promise<EmbeddingResult>;
  generateRagAnswer(
    request: Omit<RagGenerationRequest, 'model' | 'maximumOutputTokens'> & {
      maximumOutputTokens?: number;
    },
  ): Promise<RagGenerationResult>;
  checkReadiness(): Promise<AiGatewayReadiness>;
}

export type AiGatewayErrorCode =
  | 'AI_CONFIGURATION_INVALID'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_RATE_LIMITED'
  | 'AI_BUDGET_EXCEEDED'
  | 'AI_TIMEOUT'
  | 'AI_INVALID_RESPONSE'
  | 'AI_REQUEST_REJECTED';

export class AiGatewayError extends Error {
  constructor(
    readonly code: AiGatewayErrorCode,
    readonly transient: boolean,
    safeMessage: string,
    readonly providerDiagnostic?: AiProviderDiagnostic,
  ) {
    super(safeMessage);
    this.name = 'AiGatewayError';
  }
}

function estimateTokens(texts: readonly string[]) {
  return Math.ceil(texts.reduce((total, text) => total + text.length, 0) / 4);
}

function estimateCost(inputTokens: number, outputTokens: number) {
  return Number((inputTokens * 0.000_001 + outputTokens * 0.000_004).toFixed(6));
}

function validateEmbeddingResult(
  result: EmbeddingResult,
  expectedCount: number,
  expectedDimensions: number,
) {
  if (
    result.vectors.length !== expectedCount ||
    result.dimensions !== expectedDimensions ||
    result.vectors.some(
      (vector) =>
        vector.length !== expectedDimensions || vector.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new AiGatewayError(
      'AI_INVALID_RESPONSE',
      false,
      'Embedding provider вернул несовместимый результат.',
    );
  }
}

function safeDiagnosticToken(value: unknown, maximumLength = 64) {
  if (typeof value !== 'string' || value.length > maximumLength) return undefined;
  return /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(value) ? value : undefined;
}

export function normalizeOpenAiBaseUrl(baseUrl?: string) {
  const normalized = new URL(baseUrl?.trim() || 'https://api.openai.com/v1');
  if (normalized.origin === 'https://api.openai.com' && normalized.pathname === '/') {
    normalized.pathname = '/v1';
  }
  return normalized.toString().replace(/\/$/u, '');
}

function diagnosticProvider(provider: string): AiProviderDiagnostic['provider'] {
  return provider === 'openai' ||
    provider === 'gemini' ||
    provider === 'fake' ||
    provider === 'disabled'
    ? provider
    : 'unknown';
}

function classifyProviderError(
  error: unknown,
  provider: AiProviderDiagnostic['provider'],
  operation: AiProviderDiagnostic['operation'],
): AiGatewayError {
  if (error instanceof AiGatewayError) return error;
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const nestedError =
    record.error && typeof record.error === 'object'
      ? (record.error as Record<string, unknown>)
      : {};
  const headers = record.headers as { get?: (name: string) => string | null } | undefined;
  const requestId = record.requestID ?? record.request_id ?? headers?.get?.('x-request-id');
  const status = typeof record.status === 'number' ? record.status : undefined;
  const diagnostic: AiProviderDiagnostic = {
    provider,
    operation,
    ...(status !== undefined ? { httpStatus: status } : {}),
    ...(safeDiagnosticToken(record.name)
      ? { providerErrorName: safeDiagnosticToken(record.name) }
      : {}),
    ...(safeDiagnosticToken(record.type ?? nestedError.type)
      ? { providerErrorType: safeDiagnosticToken(record.type ?? nestedError.type) }
      : {}),
    ...(safeDiagnosticToken(record.code ?? nestedError.code)
      ? { providerErrorCode: safeDiagnosticToken(record.code ?? nestedError.code) }
      : {}),
    ...(safeDiagnosticToken(requestId, 128)
      ? { providerRequestId: safeDiagnosticToken(requestId, 128) }
      : {}),
  };
  if (status === 429 || (status !== undefined && status >= 500)) {
    return new AiGatewayError(
      'AI_PROVIDER_UNAVAILABLE',
      true,
      'AI provider временно недоступен.',
      diagnostic,
    );
  }
  return new AiGatewayError(
    'AI_REQUEST_REJECTED',
    false,
    'AI provider отклонил запрос.',
    diagnostic,
  );
}

async function withTimeout<T>(
  timeoutMs: number,
  action: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([
      action(controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          'abort',
          () =>
            reject(new AiGatewayError('AI_TIMEOUT', true, 'Превышено время ожидания AI provider.')),
          { once: true },
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function deterministicVector(text: string, dimensions: number) {
  const vector = Array<number>(dimensions).fill(0);
  const normalized = text.toLocaleLowerCase('und').normalize('NFKC');
  const tokens = [
    ...normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean),
    ...Array.from({ length: Math.max(0, normalized.length - 2) }, (_, index) =>
      normalized.slice(index, index + 3),
    ),
  ];
  for (const token of tokens) {
    const digest = createHash('sha256').update(token).digest();
    const index = digest.readUInt32BE(0) % dimensions;
    const sign = digest[4] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude > 0 ? vector.map((value) => value / magnitude) : vector;
}

export class DeterministicFakeAiProvider implements EmbeddingProvider, RagAnswerProvider {
  readonly id = 'fake';

  async embed(request: EmbeddingRequest, _signal?: AbortSignal): Promise<EmbeddingResult> {
    void _signal;
    const inputTokens = estimateTokens(request.texts);
    return {
      vectors: request.texts.map((text) => deterministicVector(text, request.dimensions)),
      model: request.model,
      dimensions: request.dimensions,
      usage: {
        inputTokens,
        outputTokens: 0,
        estimatedCostEur: 0,
      },
    };
  }

  async generate(
    request: RagGenerationRequest,
    _signal?: AbortSignal,
  ): Promise<RagGenerationResult> {
    void _signal;
    const excerpts = request.sources.slice(0, 3).map((source) => {
      const compact = source.excerpt.replace(/\s+/g, ' ').trim().slice(0, 280);
      return `${compact} [${source.sourceId}]`;
    });
    return {
      answer:
        excerpts.length > 0
          ? `По найденным источникам: ${excerpts.join(' ')}`
          : 'В доступных источниках недостаточно данных для ответа.',
      model: request.model,
      usage: {
        inputTokens: estimateTokens([
          request.question,
          request.systemInstructions,
          ...request.sources.map((source) => source.excerpt),
        ]),
        outputTokens: estimateTokens(excerpts),
        estimatedCostEur: 0,
      },
    };
  }

  async checkAvailability(): Promise<AiProviderAvailability> {
    return {
      configured: true,
      available: true,
      capabilities: {
        embeddings: true,
        answers: true,
      },
    };
  }
}

export class DisabledAiProvider implements EmbeddingProvider, RagAnswerProvider {
  readonly id = 'disabled';

  async embed(): Promise<EmbeddingResult> {
    throw new AiGatewayError('AI_CONFIGURATION_INVALID', false, 'Embedding provider отключён.');
  }

  async generate(): Promise<RagGenerationResult> {
    throw new AiGatewayError('AI_CONFIGURATION_INVALID', false, 'RAG provider отключён.');
  }

  async checkAvailability(): Promise<AiProviderAvailability> {
    return {
      configured: false,
      available: false,
      capabilities: {
        embeddings: false,
        answers: false,
      },
    };
  }
}

export class OpenAiGatewayProvider implements EmbeddingProvider, RagAnswerProvider {
  readonly id = 'openai';
  private readonly client: OpenAI;
  private readonly requestStatuses = new Map<string, number>();
  private readonly configured: boolean;

  constructor(apiKey: string, fetchImplementation?: typeof globalThis.fetch) {
    this.configured = apiKey.trim().length > 0;
    const fetcher = fetchImplementation ?? globalThis.fetch;
    this.client = new OpenAI({
      apiKey,
      baseURL: normalizeOpenAiBaseUrl(process.env.OPENAI_BASE_URL),
      maxRetries: process.env.BROWSER_REAL_AI_KB_SMOKE === '1' ? 0 : 2,
      fetch: async (input, init) => {
        const response = await fetcher(input, init);
        const requestId = response.headers.get('x-request-id');
        if (requestId) this.requestStatuses.set(requestId, response.status);
        return response;
      },
    });
  }

  private responseDiagnostic(requestId: unknown, operation: AiProviderDiagnostic['operation']) {
    const safeRequestId = safeDiagnosticToken(requestId, 128);
    const httpStatus = safeRequestId ? this.requestStatuses.get(safeRequestId) : undefined;
    if (safeRequestId) this.requestStatuses.delete(safeRequestId);
    return {
      provider: 'openai' as const,
      operation,
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      ...(safeRequestId ? { providerRequestId: safeRequestId } : {}),
    };
  }

  async embed(request: EmbeddingRequest, signal: AbortSignal): Promise<EmbeddingResult> {
    const response = await this.client.embeddings.create(
      {
        model: request.model,
        input: [...request.texts],
        dimensions: request.dimensions,
        encoding_format: 'float',
      },
      { signal },
    );
    const inputTokens = response.usage?.prompt_tokens ?? estimateTokens(request.texts);
    return {
      vectors: response.data.map((item) => item.embedding),
      model: response.model,
      dimensions: request.dimensions,
      providerDiagnostic: this.responseDiagnostic(response._request_id, 'embedding'),
      usage: {
        inputTokens,
        outputTokens: 0,
        estimatedCostEur: estimateCost(inputTokens, 0),
      },
    };
  }

  async generate(request: RagGenerationRequest, signal: AbortSignal): Promise<RagGenerationResult> {
    const response = await this.client.responses.create(
      {
        model: request.model,
        store: false,
        instructions: request.systemInstructions,
        input: assembleProviderContext(request),
        max_output_tokens: request.maximumOutputTokens,
        ...(process.env.BROWSER_REAL_AI_DIAGNOSTIC_MODE === '1'
          ? { reasoning: { effort: 'low' as const } }
          : {}),
      },
      { signal },
    );
    const responseError = response.error as unknown as Record<string, unknown> | null;
    if ((response.status && response.status !== 'completed') || response.error) {
      const diagnostic: AiProviderDiagnostic = {
        ...this.responseDiagnostic(response._request_id, 'answer'),
        ...(response.status ? { responseStatus: response.status } : {}),
        ...(safeDiagnosticToken(responseError?.type)
          ? { responseErrorType: safeDiagnosticToken(responseError?.type) }
          : {}),
        ...(safeDiagnosticToken(response.error?.code)
          ? { responseErrorCode: safeDiagnosticToken(response.error?.code) }
          : {}),
        ...(safeDiagnosticToken(response.incomplete_details?.reason)
          ? { incompleteReason: safeDiagnosticToken(response.incomplete_details?.reason) }
          : {}),
      };
      throw new AiGatewayError(
        response.status === 'failed' ? 'AI_PROVIDER_UNAVAILABLE' : 'AI_INVALID_RESPONSE',
        response.status === 'failed',
        'AI provider не завершил генерацию ответа.',
        diagnostic,
      );
    }
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    return {
      answer: response.output_text?.trim() ?? '',
      model: request.model,
      providerDiagnostic: {
        ...this.responseDiagnostic(response._request_id, 'answer'),
        responseStatus: response.status,
      },
      usage: {
        inputTokens,
        outputTokens,
        estimatedCostEur: estimateCost(inputTokens, outputTokens),
      },
    };
  }

  async checkAvailability(): Promise<AiProviderAvailability> {
    return {
      configured: this.configured,
      available: this.configured,
      capabilities: {
        embeddings: true,
        answers: true,
      },
    };
  }
}

export class GeminiAiGatewayProvider implements EmbeddingProvider, RagAnswerProvider {
  readonly id = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly healthModel: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    const response = await (
      this.client.models.embedContent as unknown as (input: unknown) => Promise<{
        embeddings?: Array<{ values?: number[] }>;
      }>
    )({
      model: request.model,
      contents: [...request.texts],
      config: {
        outputDimensionality: request.dimensions,
        taskType: request.purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
      },
    });
    const vectors = response.embeddings?.map((embedding) => embedding.values ?? []) ?? [];
    const inputTokens = estimateTokens(request.texts);
    return {
      vectors,
      model: request.model,
      dimensions: request.dimensions,
      usage: {
        inputTokens,
        outputTokens: 0,
        estimatedCostEur: estimateCost(inputTokens, 0),
      },
    };
  }

  async generate(request: RagGenerationRequest): Promise<RagGenerationResult> {
    const response = await this.client.models.generateContent({
      model: request.model,
      contents: assembleProviderContext(request),
      config: {
        systemInstruction: request.systemInstructions,
        maxOutputTokens: request.maximumOutputTokens,
      },
    });
    const inputTokens =
      response.usageMetadata?.promptTokenCount ??
      estimateTokens([request.question, ...request.sources.map((source) => source.excerpt)]);
    const outputTokens =
      response.usageMetadata?.candidatesTokenCount ?? estimateTokens([response.text ?? '']);
    return {
      answer: response.text?.trim() ?? '',
      model: request.model,
      usage: {
        inputTokens,
        outputTokens,
        estimatedCostEur: estimateCost(inputTokens, outputTokens),
      },
    };
  }

  async checkAvailability(): Promise<AiProviderAvailability> {
    try {
      await this.client.models.get({ model: this.healthModel });
      return {
        configured: true,
        available: true,
        capabilities: {
          embeddings: true,
          answers: true,
        },
      };
    } catch {
      return {
        configured: true,
        available: false,
        capabilities: {
          embeddings: true,
          answers: true,
        },
      };
    }
  }
}

export function assembleProviderContext(request: RagGenerationRequest) {
  const sources = request.sources
    .map(
      (source) =>
        `<source id="${source.sourceId}" document="${source.documentId}" chunk="${source.chunkId}">\n${source.excerpt}\n</source>`,
    )
    .join('\n\n');
  return [
    `<question language="${request.language}">`,
    request.question,
    '</question>',
    '<untrusted_retrieved_documents>',
    sources,
    '</untrusted_retrieved_documents>',
  ].join('\n');
}

function providerForDriver(
  driver: AiProviderDriver,
  environment: Record<string, string | undefined>,
  healthModel: string,
) {
  if (driver === 'fake') return new DeterministicFakeAiProvider();
  if (driver === 'openai') return new OpenAiGatewayProvider(environment.OPENAI_API_KEY ?? '');
  if (driver === 'gemini') {
    return new GeminiAiGatewayProvider(environment.GOOGLE_GENERATIVE_AI_API_KEY ?? '', healthModel);
  }
  return new DisabledAiProvider();
}

export class DefaultAiGateway implements AiGateway {
  private readonly rateLimiter: DistributedAiRateLimiter;
  private readonly costController: AiCostController;

  constructor(
    private readonly configuration: RagConfiguration,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly answerProvider: RagAnswerProvider,
    private readonly events: AiOperationalEventSink = new NoopAiOperationalEventSink(),
    now: () => Date = () => new Date(),
    controls: {
      rateLimiter?: DistributedAiRateLimiter;
      costController?: AiCostController;
    } = {},
  ) {
    this.rateLimiter = controls.rateLimiter ?? new MemoryAiRateLimiter(now);
    this.costController =
      controls.costController ??
      new MemoryAiCostController(
        configuration.limits.dailyBudgetEur,
        configuration.limits.monthlyBudgetEur,
        now,
        configuration.limits.sessionProviderOperationLimit,
        configuration.limits.sessionBudgetLimitEur,
      );
  }

  async createDocumentEmbeddings(request: Omit<EmbeddingRequest, 'model' | 'dimensions'>) {
    return this.embed({
      ...request,
      model: this.configuration.embedding.model,
      dimensions: this.configuration.embedding.dimensions,
    });
  }

  async createQueryEmbedding(
    request: Omit<EmbeddingRequest, 'model' | 'dimensions' | 'purpose' | 'texts'> & {
      query: string;
    },
  ) {
    return this.embed({
      tenant: request.tenant,
      texts: [request.query],
      purpose: 'query',
      correlationId: request.correlationId,
      model: this.configuration.embedding.model,
      dimensions: this.configuration.embedding.dimensions,
    });
  }

  async generateRagAnswer(
    request: Omit<RagGenerationRequest, 'model' | 'maximumOutputTokens'> & {
      maximumOutputTokens?: number;
    },
  ) {
    const maximumOutputTokens =
      request.maximumOutputTokens ?? this.configuration.answer.maximumOutputTokens;
    if (
      !Number.isSafeInteger(maximumOutputTokens) ||
      maximumOutputTokens <= 0 ||
      maximumOutputTokens > this.configuration.answer.maximumOutputTokens
    ) {
      throw new AiGatewayError('AI_REQUEST_REJECTED', false, 'AI output token limit is invalid.');
    }
    const estimatedInput = estimateTokens([
      request.question,
      request.systemInstructions,
      ...request.sources.map((source) => source.excerpt),
    ]);
    const reservation = await this.authorize(
      request.tenant,
      this.answerProvider.id,
      this.configuration.answer.model,
      'rag_answer',
      request.correlationId,
      this.estimateReservedCost(estimateCost(estimatedInput, maximumOutputTokens)),
    );
    const startedAt = Date.now();
    let attemptCount = 0;
    try {
      const retried = await this.withRetry(
        () =>
          withTimeout(this.configuration.answer.timeoutMs, (signal) =>
            this.answerProvider.generate(
              {
                ...request,
                model: this.configuration.answer.model,
                maximumOutputTokens,
              },
              signal,
            ),
          ),
        diagnosticProvider(this.answerProvider.id),
        'answer',
      );
      const { result, attemptCount: attempts } = retried;
      attemptCount = attempts;
      if (!result.answer.trim()) {
        throw new AiGatewayError('AI_INVALID_RESPONSE', false, 'AI provider не вернул ответ.');
      }
      await this.recordUsage(reservation, result.usage, 0);
      this.events.record({
        name: 'provider_call',
        occurredAt: new Date().toISOString(),
        companyId: request.tenant.companyId,
        correlationId: request.correlationId,
        outcome: 'success',
        durationMs: Date.now() - startedAt,
        attemptCount,
        reservedCostEur: reservation.estimatedCostEur,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        estimatedCostEur: result.usage.estimatedCostEur,
        providerDiagnostic: {
          ...(result.providerDiagnostic ?? {
            provider: diagnosticProvider(this.answerProvider.id),
            operation: 'answer',
          }),
          stage: 'rag_answer',
          attemptCount,
        },
      });
      return result;
    } catch (error) {
      await this.costController.release(reservation);
      const classified = classifyProviderError(
        error,
        diagnosticProvider(this.answerProvider.id),
        'answer',
      );
      attemptCount ||= classified.providerDiagnostic?.attemptCount ?? 0;
      const normalized = new AiGatewayError(
        classified.code,
        classified.transient,
        classified.message,
        {
          ...(classified.providerDiagnostic ?? {
            provider: diagnosticProvider(this.answerProvider.id),
            operation: 'answer',
          }),
          stage: 'rag_answer',
          attemptCount,
        },
      );
      this.events.record({
        name: 'provider_call',
        occurredAt: new Date().toISOString(),
        companyId: request.tenant.companyId,
        correlationId: request.correlationId,
        outcome: 'failure',
        durationMs: Date.now() - startedAt,
        attemptCount,
        reservedCostEur: reservation.estimatedCostEur,
        errorCode: normalized.code,
        providerDiagnostic: normalized.providerDiagnostic,
      });
      if (normalized.providerDiagnostic) {
        console.warn(
          JSON.stringify({
            event: 'ai_provider_failure',
            errorCode: normalized.code,
            ...normalized.providerDiagnostic,
          }),
        );
      }
      throw normalized;
    }
  }

  async checkReadiness() {
    const [embedding, answer] = await Promise.all([
      this.embeddingProvider.checkAvailability(),
      this.answerProvider.checkAvailability(),
    ]);
    return { embedding, answer };
  }

  private async embed(request: EmbeddingRequest) {
    if (request.texts.length === 0) {
      throw new AiGatewayError('AI_REQUEST_REJECTED', false, 'Embedding input is empty.');
    }
    const requestType: AiRequestType =
      request.purpose === 'document' ? 'document_embedding' : 'query_embedding';
    const reservation = await this.authorize(
      request.tenant,
      this.embeddingProvider.id,
      request.model,
      requestType,
      request.correlationId,
      this.estimateReservedCost(estimateCost(estimateTokens(request.texts), 0)),
    );
    const startedAt = Date.now();
    let attemptCount = 0;
    try {
      const retried = await this.withRetry(
        () =>
          withTimeout(this.configuration.embedding.timeoutMs, (signal) =>
            this.embeddingProvider.embed(request, signal),
          ),
        diagnosticProvider(this.embeddingProvider.id),
        'embedding',
      );
      const { result, attemptCount: attempts } = retried;
      attemptCount = attempts;
      validateEmbeddingResult(result, request.texts.length, request.dimensions);
      await this.recordUsage(reservation, result.usage, request.texts.length);
      this.events.record({
        name: 'provider_call',
        occurredAt: new Date().toISOString(),
        companyId: request.tenant.companyId,
        correlationId: request.correlationId,
        outcome: 'success',
        durationMs: Date.now() - startedAt,
        attemptCount,
        reservedCostEur: reservation.estimatedCostEur,
        inputTokens: result.usage.inputTokens,
        estimatedCostEur: result.usage.estimatedCostEur,
        providerDiagnostic: {
          ...(result.providerDiagnostic ?? {
            provider: diagnosticProvider(this.embeddingProvider.id),
            operation: 'embedding',
          }),
          stage: requestType,
          attemptCount,
        },
      });
      return result;
    } catch (error) {
      await this.costController.release(reservation);
      const classified = classifyProviderError(
        error,
        diagnosticProvider(this.embeddingProvider.id),
        'embedding',
      );
      attemptCount ||= classified.providerDiagnostic?.attemptCount ?? 0;
      const normalized = new AiGatewayError(
        classified.code,
        classified.transient,
        classified.message,
        {
          ...(classified.providerDiagnostic ?? {
            provider: diagnosticProvider(this.embeddingProvider.id),
            operation: 'embedding',
          }),
          stage: requestType,
          attemptCount,
        },
      );
      this.events.record({
        name: 'provider_call',
        occurredAt: new Date().toISOString(),
        companyId: request.tenant.companyId,
        correlationId: request.correlationId,
        outcome: 'failure',
        durationMs: Date.now() - startedAt,
        attemptCount,
        reservedCostEur: reservation.estimatedCostEur,
        errorCode: normalized.code,
        providerDiagnostic: normalized.providerDiagnostic,
      });
      if (normalized.providerDiagnostic) {
        console.warn(
          JSON.stringify({
            event: 'ai_provider_failure',
            errorCode: normalized.code,
            ...normalized.providerDiagnostic,
          }),
        );
      }
      throw normalized;
    }
  }

  private async withRetry<T>(
    action: () => Promise<T>,
    provider: AiProviderDiagnostic['provider'],
    operation: AiProviderDiagnostic['operation'],
  ): Promise<{ result: T; attemptCount: number }> {
    let lastError: AiGatewayError | undefined;
    for (let attempt = 1; attempt <= this.configuration.limits.providerMaxAttempts; attempt += 1) {
      try {
        return { result: await action(), attemptCount: attempt };
      } catch (error) {
        const classified = classifyProviderError(error, provider, operation);
        lastError = new AiGatewayError(classified.code, classified.transient, classified.message, {
          ...(classified.providerDiagnostic ?? { provider, operation }),
          attemptCount: attempt,
        });
        if (!lastError.transient || attempt === this.configuration.limits.providerMaxAttempts) {
          throw lastError;
        }
      }
    }
    throw lastError;
  }

  private async authorize(
    tenant: DocumentTenantContext,
    provider: string,
    model: string,
    requestType: AiRequestType,
    correlationId: string,
    estimatedCostEur: number,
    usageIdempotencyKey?: string,
  ) {
    let allowed = false;
    try {
      allowed = await this.rateLimiter.consume({
        tenant,
        provider,
        requestType,
        minuteLimit: this.configuration.limits.rateLimitPerMinute,
        dailyLimit: this.configuration.limits.rateLimitPerDay,
        burstLimit: this.configuration.limits.burstLimit,
      });
    } catch {
      throw new AiGatewayError('AI_RATE_LIMITED', true, 'Distributed AI rate limiter недоступен.');
    }
    if (!allowed) {
      throw new AiGatewayError('AI_RATE_LIMITED', true, 'Лимит AI-запросов временно исчерпан.');
    }
    const reservation = await this.costController.reserve({
      tenant,
      provider,
      model,
      requestType,
      correlationId,
      idempotencyKey: usageIdempotencyKey ?? `${requestType}:${correlationId}`,
      estimatedCostEur,
    });
    if (!reservation) {
      throw new AiGatewayError('AI_BUDGET_EXCEEDED', false, 'Бюджет AI исчерпан.');
    }
    return reservation;
  }

  private async recordUsage(
    reservation: AiBudgetReservation,
    usage: AiUsage,
    embeddingUnits: number,
  ) {
    const estimatedCostEur =
      this.configuration.limits.sessionBudgetLimitEur === undefined
        ? usage.estimatedCostEur
        : Math.max(reservation.estimatedCostEur, Number((usage.estimatedCostEur * 2).toFixed(6)));
    await this.costController.reconcile({
      reservation,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      embeddingUnits,
      estimatedCostEur,
      status: 'SUCCEEDED',
    });
  }

  private estimateReservedCost(estimatedCostEur: number) {
    return this.configuration.limits.sessionBudgetLimitEur === undefined
      ? estimatedCostEur
      : Number((estimatedCostEur * 2).toFixed(6));
  }
}

export function createAiGateway(
  configuration: RagConfiguration,
  options: {
    embeddingProvider?: EmbeddingProvider;
    answerProvider?: RagAnswerProvider;
    events?: AiOperationalEventSink;
    environment?: Record<string, string | undefined>;
    now?: () => Date;
    rateLimiter?: DistributedAiRateLimiter;
    costController?: AiCostController;
  } = {},
) {
  const environment = options.environment ?? process.env;
  const embeddingProvider =
    options.embeddingProvider ??
    providerForDriver(configuration.embedding.driver, environment, configuration.embedding.model);
  const answerProvider =
    options.answerProvider ??
    providerForDriver(configuration.answer.driver, environment, configuration.answer.model);
  return new DefaultAiGateway(
    configuration,
    embeddingProvider,
    answerProvider,
    options.events,
    options.now,
    {
      rateLimiter: options.rateLimiter,
      costController: options.costController,
    },
  );
}
