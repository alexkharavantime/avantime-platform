import path from 'node:path';

export const AI_PROVIDER_DRIVERS = ['fake', 'openai', 'gemini', 'disabled'] as const;
export type AiProviderDriver = (typeof AI_PROVIDER_DRIVERS)[number];

export const VECTOR_DRIVERS = ['memory', 'pgvector'] as const;
export type VectorDriver = (typeof VECTOR_DRIVERS)[number];

export const EMBEDDING_QUEUE_DRIVERS = ['local', 'postgresql', 'redis'] as const;
export type EmbeddingQueueDriver = (typeof EMBEDDING_QUEUE_DRIVERS)[number];

export type RagConfiguration = {
  production: boolean;
  requiredForReadiness: boolean;
  dataDirectory: string;
  embedding: {
    driver: AiProviderDriver;
    model: string;
    dimensions: number;
    version: string;
    batchSize: number;
    timeoutMs: number;
    maxAttempts: number;
    initialRetryMs: number;
    maximumRetryMs: number;
  };
  vector: {
    driver: VectorDriver;
  };
  embeddingQueue: {
    driver: EmbeddingQueueDriver;
    leaseMs: number;
    pollMs: number;
  };
  hybrid: {
    lexicalWeight: number;
    semanticWeight: number;
    topK: number;
    maximumChunksPerDocument: number;
    minimumScore: number;
    semanticSimilarityThreshold: number;
  };
  answer: {
    driver: AiProviderDriver;
    model: string;
    maximumContextCharacters: number;
    maximumOutputTokens: number;
    timeoutMs: number;
  };
  limits: {
    queryMaximumCharacters: number;
    rateLimitPerMinute: number;
    rateLimitPerDay: number;
    burstLimit: number;
    dailyBudgetEur: number;
    monthlyBudgetEur: number;
  };
};

function parseEnum<T extends string>(
  environment: Record<string, string | undefined>,
  name: string,
  fallback: T,
  values: readonly T[],
) {
  const value = (environment[name]?.trim() || fallback) as T;
  if (!values.includes(value)) {
    throw new Error(`${name} has an unsupported value.`);
  }
  return value;
}

function parsePositiveInteger(
  environment: Record<string, string | undefined>,
  name: string,
  fallback: number,
) {
  const value = environment[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegativeNumber(
  environment: Record<string, string | undefined>,
  name: string,
  fallback: number,
) {
  const value = environment[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return parsed;
}

function parseUnitInterval(
  environment: Record<string, string | undefined>,
  name: string,
  fallback: number,
) {
  const parsed = parseNonNegativeNumber(environment, name, fallback);
  if (parsed > 1) {
    throw new Error(`${name} must be between 0 and 1.`);
  }
  return parsed;
}

function parseBoolean(
  environment: Record<string, string | undefined>,
  name: string,
  fallback: boolean,
) {
  const value = environment[name]?.trim();
  if (!value) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

function requireValue(environment: Record<string, string | undefined>, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for the selected RAG configuration.`);
  return value;
}

function assertSafeIdentifier(value: string, name: string, maximum = 200) {
  if (!value || value.length > maximum || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value)) {
    throw new Error(`${name} has an invalid value.`);
  }
  return value;
}

function assertProviderConfiguration(
  environment: Record<string, string | undefined>,
  driver: AiProviderDriver,
) {
  if (driver === 'openai') requireValue(environment, 'OPENAI_API_KEY');
  if (driver === 'gemini') requireValue(environment, 'GOOGLE_GENERATIVE_AI_API_KEY');
}

export function loadRagConfiguration(
  environment: Record<string, string | undefined> = process.env,
): RagConfiguration {
  const production =
    environment.NODE_ENV === 'production' &&
    !(environment.APP_ENV === 'staging' && environment.STAGING_MODE === 'local');
  const embeddingDriver = parseEnum(
    environment,
    'DOCUMENT_EMBEDDING_DRIVER',
    production ? 'disabled' : 'fake',
    AI_PROVIDER_DRIVERS,
  );
  const vectorDriver = parseEnum(
    environment,
    'DOCUMENT_VECTOR_DRIVER',
    production ? 'pgvector' : 'memory',
    VECTOR_DRIVERS,
  );
  const answerDriver = parseEnum(
    environment,
    'RAG_ANSWER_DRIVER',
    production ? 'disabled' : 'fake',
    AI_PROVIDER_DRIVERS,
  );
  const embeddingQueueDriver = parseEnum(
    environment,
    'DOCUMENT_EMBEDDING_QUEUE_DRIVER',
    production ? 'redis' : vectorDriver === 'pgvector' ? 'postgresql' : 'local',
    EMBEDDING_QUEUE_DRIVERS,
  );
  const requiredForReadiness = parseBoolean(
    environment,
    'DOCUMENT_RAG_REQUIRED_FOR_READINESS',
    production,
  );

  if (production) {
    requireValue(environment, 'DOCUMENT_EMBEDDING_DRIVER');
    requireValue(environment, 'DOCUMENT_VECTOR_DRIVER');
    requireValue(environment, 'RAG_ANSWER_DRIVER');
    requireValue(environment, 'DATABASE_URL');
    if (embeddingDriver === 'fake' || embeddingDriver === 'disabled') {
      throw new Error('Production document embeddings require a configured provider.');
    }
    if (answerDriver === 'fake' || answerDriver === 'disabled') {
      throw new Error('Production RAG answers require a configured provider.');
    }
    assertProviderConfiguration(environment, embeddingDriver);
    assertProviderConfiguration(environment, answerDriver);
    if (vectorDriver !== 'pgvector') {
      throw new Error('Production vector storage must use pgvector.');
    }
    if (embeddingQueueDriver !== 'redis') {
      throw new Error('Production embedding jobs must use the Redis external queue.');
    }
    if (!requiredForReadiness) {
      throw new Error('Production RAG must be required for readiness.');
    }
  }
  if (vectorDriver === 'pgvector') requireValue(environment, 'DATABASE_URL');
  if (embeddingQueueDriver === 'postgresql') requireValue(environment, 'DATABASE_URL');
  if (embeddingQueueDriver === 'redis') requireValue(environment, 'REDIS_URL');
  if (embeddingDriver === 'disabled' && answerDriver !== 'disabled') {
    throw new Error('RAG answers cannot be enabled while document embeddings are disabled.');
  }
  if (!production) {
    assertProviderConfiguration(environment, embeddingDriver);
    assertProviderConfiguration(environment, answerDriver);
  }

  const lexicalWeight = parseUnitInterval(environment, 'HYBRID_LEXICAL_WEIGHT', 0.45);
  const semanticWeight = parseUnitInterval(environment, 'HYBRID_SEMANTIC_WEIGHT', 0.55);
  if (lexicalWeight + semanticWeight <= 0) {
    throw new Error('At least one hybrid retrieval weight must be greater than zero.');
  }

  return {
    production,
    requiredForReadiness,
    dataDirectory: path.resolve(
      environment.DOCUMENT_DATA_DIR?.trim() || path.join(process.cwd(), '.data'),
    ),
    embedding: {
      driver: embeddingDriver,
      model: assertSafeIdentifier(
        environment.DOCUMENT_EMBEDDING_MODEL?.trim() ||
          (embeddingDriver === 'openai'
            ? 'text-embedding-3-small'
            : embeddingDriver === 'gemini'
              ? 'gemini-embedding-001'
              : 'deterministic-hash-v1'),
        'DOCUMENT_EMBEDDING_MODEL',
      ),
      dimensions: parsePositiveInteger(
        environment,
        'DOCUMENT_EMBEDDING_DIMENSIONS',
        embeddingDriver === 'openai' ? 1_536 : 32,
      ),
      version: assertSafeIdentifier(
        environment.DOCUMENT_EMBEDDING_VERSION?.trim() || 'embedding-v1',
        'DOCUMENT_EMBEDDING_VERSION',
        100,
      ),
      batchSize: parsePositiveInteger(environment, 'DOCUMENT_EMBEDDING_BATCH_SIZE', 32),
      timeoutMs: parsePositiveInteger(environment, 'DOCUMENT_EMBEDDING_TIMEOUT_MS', 30_000),
      maxAttempts: parsePositiveInteger(environment, 'DOCUMENT_EMBEDDING_MAX_ATTEMPTS', 3),
      initialRetryMs: parsePositiveInteger(
        environment,
        'DOCUMENT_EMBEDDING_INITIAL_RETRY_MS',
        1_000,
      ),
      maximumRetryMs: parsePositiveInteger(environment, 'DOCUMENT_EMBEDDING_MAX_RETRY_MS', 60_000),
    },
    vector: {
      driver: vectorDriver,
    },
    embeddingQueue: {
      driver: embeddingQueueDriver,
      leaseMs: parsePositiveInteger(environment, 'DOCUMENT_EMBEDDING_LEASE_MS', 5 * 60_000),
      pollMs: parsePositiveInteger(environment, 'DOCUMENT_EMBEDDING_POLL_MS', 1_000),
    },
    hybrid: {
      lexicalWeight,
      semanticWeight,
      topK: parsePositiveInteger(environment, 'HYBRID_TOP_K', 12),
      maximumChunksPerDocument: parsePositiveInteger(
        environment,
        'HYBRID_MAX_CHUNKS_PER_DOCUMENT',
        3,
      ),
      minimumScore: parseUnitInterval(environment, 'HYBRID_MIN_SCORE', 0.2),
      semanticSimilarityThreshold: parseUnitInterval(
        environment,
        'SEMANTIC_SIMILARITY_THRESHOLD',
        0.25,
      ),
    },
    answer: {
      driver: answerDriver,
      model: assertSafeIdentifier(
        environment.RAG_ANSWER_MODEL?.trim() ||
          (answerDriver === 'gemini' ? 'gemini-3.6-flash' : 'gpt-5-mini'),
        'RAG_ANSWER_MODEL',
      ),
      maximumContextCharacters: parsePositiveInteger(
        environment,
        'RAG_MAX_CONTEXT_CHARACTERS',
        18_000,
      ),
      maximumOutputTokens: parsePositiveInteger(environment, 'RAG_MAX_OUTPUT_TOKENS', 1_000),
      timeoutMs: parsePositiveInteger(environment, 'RAG_TIMEOUT_MS', 45_000),
    },
    limits: {
      queryMaximumCharacters: parsePositiveInteger(environment, 'RAG_QUERY_MAX_CHARACTERS', 2_000),
      rateLimitPerMinute: parsePositiveInteger(environment, 'AI_RATE_LIMIT_PER_MINUTE', 30),
      rateLimitPerDay: parsePositiveInteger(environment, 'AI_RATE_LIMIT_PER_DAY', 5_000),
      burstLimit: parsePositiveInteger(environment, 'AI_RATE_LIMIT_BURST', 10),
      dailyBudgetEur: parseNonNegativeNumber(
        environment,
        'AI_DAILY_BUDGET_EUR',
        production ? 25 : 0,
      ),
      monthlyBudgetEur: parseNonNegativeNumber(
        environment,
        'AI_MONTHLY_BUDGET_EUR',
        production ? 500 : 0,
      ),
    },
  };
}
