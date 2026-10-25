import { resolveDocumentDataDirectory } from './document-data-directory';

export type LocalRagProfile = 'real' | 'fake';
export type LocalRagTarget = 'web' | 'document-worker' | 'embedding-worker';

export function configureLocalRagProfile(
  environment: Record<string, string | undefined>,
  profile: LocalRagProfile,
  target: LocalRagTarget,
) {
  if (environment.NODE_ENV === 'production' || environment.APP_ENV === 'production') {
    throw new Error('Local RAG launchers cannot run with production environment settings.');
  }
  if (profile === 'fake' && target !== 'web') {
    throw new Error('The fake profile is only available for the local web site.');
  }

  environment.NODE_ENV = 'development';
  environment.DOCUMENT_DATA_DIR = resolveDocumentDataDirectory(environment);
  delete environment.BROWSER_REAL_AI_KB_SMOKE;
  delete environment.BROWSER_REAL_AI_DIAGNOSTIC_MODE;
  delete environment.BROWSER_REAL_AI_DISABLE_SESSION_CAPS;

  if (profile === 'real') {
    Object.assign(environment, {
      DOCUMENT_STORAGE_DRIVER: 'local',
      DOCUMENT_METADATA_DRIVER: 'postgresql',
      DOCUMENT_PROCESSING_QUEUE_DRIVER: 'local',
      DOCUMENT_EMBEDDING_DRIVER: 'openai',
      DOCUMENT_EMBEDDING_MODEL: 'text-embedding-3-small',
      DOCUMENT_EMBEDDING_DIMENSIONS: '1536',
      DOCUMENT_EMBEDDING_VERSION: 'embedding-v1',
      DOCUMENT_EMBEDDING_QUEUE_DRIVER: 'postgresql',
      DOCUMENT_VECTOR_DRIVER: 'pgvector',
      RAG_ANSWER_DRIVER: 'openai',
      RAG_MAX_OUTPUT_TOKENS: '2000',
      AI_PROVIDER_MAX_ATTEMPTS: '1',
    });
    // Default reasoning leaves too few output tokens for answer text within RAG_MAX_OUTPUT_TOKENS.
    environment.RAG_REASONING_EFFORT ||= 'low';
    if (target !== 'web') environment.DOCUMENT_WORKER_TENANT_ID ||= 'avantime';
    return;
  }

  Object.assign(environment, {
    DOCUMENT_STORAGE_DRIVER: 'local',
    DOCUMENT_METADATA_DRIVER: 'local',
    DOCUMENT_PROCESSING_QUEUE_DRIVER: 'local',
    DOCUMENT_EMBEDDING_DRIVER: 'fake',
    DOCUMENT_EMBEDDING_MODEL: 'deterministic-hash-v1',
    DOCUMENT_EMBEDDING_DIMENSIONS: '32',
    DOCUMENT_EMBEDDING_VERSION: 'deterministic-hash-v1',
    DOCUMENT_EMBEDDING_QUEUE_DRIVER: 'local',
    DOCUMENT_VECTOR_DRIVER: 'memory',
    RAG_ANSWER_DRIVER: 'fake',
    AI_PROVIDER_MAX_ATTEMPTS: '1',
  });
  delete environment.OPENAI_API_KEY;
  delete environment.GOOGLE_GENERATIVE_AI_API_KEY;
}
