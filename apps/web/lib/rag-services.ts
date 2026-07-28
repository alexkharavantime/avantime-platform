import type { EmbeddingProvider, RagAnswerProvider } from './ai-gateway';
import { createAiGateway, type AiGateway } from './ai-gateway';
import { InMemoryAiOperationalEventSink, type AiOperationalEventSink } from './ai-observability';
import {
  DefaultDocumentEmbeddingWorker,
  type DocumentEmbeddingServices,
} from './document-embedding';
import {
  LocalEmbeddingJobQueue,
  PostgreSQLEmbeddingJobQueue,
  type EmbeddingJobQueue,
} from './embedding-queue';
import type {
  DocumentMetadataRepository,
  DocumentProcessingRepository,
} from './document-repositories';
import type { RagConfiguration } from './rag-configuration';
import {
  DefaultHybridRetriever,
  DefaultLexicalRetriever,
  DefaultSemanticRetriever,
  type HybridRetriever,
  type LexicalRetriever,
  type SemanticRetriever,
} from './retrieval';
import {
  DefaultCitationBuilder,
  DefaultRagAnswerService,
  type CitationBuilder,
  type RagAnswerService,
} from './rag-answer';
import {
  InMemoryVectorRepository,
  PostgreSQLVectorRepository,
  type VectorDatabaseLoader,
  type VectorRepository,
} from './vector-repository';

export type RagDocumentDependencies = {
  metadata: DocumentMetadataRepository;
  processing: DocumentProcessingRepository;
};

export type RagServiceDependencies = {
  embeddingProvider?: EmbeddingProvider;
  answerProvider?: RagAnswerProvider;
  vectors?: VectorRepository;
  embeddingQueue?: EmbeddingJobQueue;
  loadDatabase?: VectorDatabaseLoader;
  events?: AiOperationalEventSink;
  environment?: Record<string, string | undefined>;
  now?: () => Date;
};

export type RagServices = {
  configuration: RagConfiguration;
  gateway: AiGateway;
  vectors: VectorRepository;
  embeddingQueue: EmbeddingJobQueue;
  events: AiOperationalEventSink;
  embedding: DocumentEmbeddingServices;
  lexical: LexicalRetriever;
  semantic: SemanticRetriever;
  hybrid: HybridRetriever;
  citationBuilder: CitationBuilder;
  answers: RagAnswerService;
  createEmbeddingWorker(): DefaultDocumentEmbeddingWorker;
};

export function createRagServices(
  configuration: RagConfiguration,
  documents: RagDocumentDependencies,
  dependencies: RagServiceDependencies = {},
): RagServices {
  const events = dependencies.events ?? new InMemoryAiOperationalEventSink();
  const gateway = createAiGateway(configuration, {
    embeddingProvider: dependencies.embeddingProvider,
    answerProvider: dependencies.answerProvider,
    events,
    environment: dependencies.environment,
    now: dependencies.now,
  });
  const vectors =
    dependencies.vectors ??
    (configuration.vector.driver === 'pgvector'
      ? new PostgreSQLVectorRepository(dependencies.loadDatabase)
      : new InMemoryVectorRepository((tenant, documentId) =>
          documents.metadata.findById(tenant, documentId),
        ));
  const embeddingQueue =
    dependencies.embeddingQueue ??
    (configuration.embeddingQueue.driver === 'postgresql'
      ? new PostgreSQLEmbeddingJobQueue(dependencies.loadDatabase)
      : new LocalEmbeddingJobQueue(configuration.dataDirectory));
  const embedding: DocumentEmbeddingServices = {
    metadata: documents.metadata,
    processing: documents.processing,
    vectors,
    queue: embeddingQueue,
    gateway,
    configuration,
    events,
    now: dependencies.now,
  };
  const lexical = new DefaultLexicalRetriever(
    documents.metadata,
    documents.processing,
    configuration,
    events,
  );
  const semantic = new DefaultSemanticRetriever(gateway, vectors, configuration, events);
  const hybrid = new DefaultHybridRetriever(lexical, semantic, configuration);
  const citationBuilder = new DefaultCitationBuilder(documents.metadata, documents.processing);
  const answers = new DefaultRagAnswerService(
    hybrid,
    citationBuilder,
    gateway,
    configuration,
    events,
  );
  return {
    configuration,
    gateway,
    vectors,
    embeddingQueue,
    events,
    embedding,
    lexical,
    semantic,
    hybrid,
    citationBuilder,
    answers,
    createEmbeddingWorker: () => new DefaultDocumentEmbeddingWorker(embedding),
  };
}
