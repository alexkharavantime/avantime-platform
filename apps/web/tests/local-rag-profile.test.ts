import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadDocumentConfiguration } from '../lib/document-configuration';
import { configureLocalRagProfile } from '../lib/local-rag-profile';
import { loadRagConfiguration } from '../lib/rag-configuration';

const repositoryRoot = new URL('../../..', import.meta.url);

test('generic worker commands preserve the caller environment and local commands are explicit', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('apps/web/package.json', repositoryRoot), 'utf8'),
  ) as { scripts: Record<string, string> };

  assert.equal(packageJson.scripts['documents:worker'], 'tsx scripts/run-document-worker.ts');
  assert.equal(
    packageJson.scripts['documents:embedding-worker'],
    'tsx scripts/run-document-embedding-worker.ts',
  );
  assert.match(packageJson.scripts['documents:worker:local'], /start-local-rag\.ts real document-worker/u);
  assert.match(
    packageJson.scripts['documents:embedding-worker:local'],
    /start-local-rag\.ts real embedding-worker/u,
  );
});

test('local profile rejects production markers without mutating the environment', () => {
  for (const environment of [
    {
      NODE_ENV: 'production',
      DOCUMENT_STORAGE_DRIVER: 's3',
      DOCUMENT_PROCESSING_QUEUE_DRIVER: 'redis',
    },
    {
      NODE_ENV: 'development',
      APP_ENV: 'production',
      DOCUMENT_STORAGE_DRIVER: 's3',
      DOCUMENT_PROCESSING_QUEUE_DRIVER: 'redis',
    },
  ]) {
    const original = { ...environment };
    assert.throws(
      () => configureLocalRagProfile(environment, 'real', 'document-worker'),
      /production environment settings/u,
    );
    assert.deepEqual(environment, original);
  }
});

test('explicit local real profile applies documented local adapters and shared data path', () => {
  const environment: Record<string, string | undefined> = {
    NODE_ENV: 'test',
    OPENAI_API_KEY: 'test-key',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/avantime',
    DOCUMENT_STORAGE_DRIVER: 's3',
    DOCUMENT_PROCESSING_QUEUE_DRIVER: 'redis',
    DOCUMENT_EMBEDDING_QUEUE_DRIVER: 'redis',
    DOCUMENT_VECTOR_DRIVER: 'memory',
  };

  configureLocalRagProfile(environment, 'real', 'document-worker');

  const documents = loadDocumentConfiguration(environment);
  const rag = loadRagConfiguration(environment);
  assert.equal(environment.NODE_ENV, 'development');
  assert.equal(environment.DOCUMENT_WORKER_TENANT_ID, 'avantime');
  assert.equal(documents.storageDriver, 'local');
  assert.equal(documents.metadataDriver, 'postgresql');
  assert.equal(documents.queueDriver, 'local');
  assert.equal(rag.embedding.driver, 'openai');
  assert.equal(rag.embeddingQueue.driver, 'postgresql');
  assert.equal(rag.vector.driver, 'pgvector');
  assert.equal(rag.answer.driver, 'openai');
  assert.equal(rag.limits.providerMaxAttempts, 1);
  assert.equal(
    documents.dataDirectory,
    path.resolve(fileURLToPath(repositoryRoot), 'apps', 'web', '.data'),
  );
});

test('local real profile limits answer reasoning unless an effort is configured explicitly', () => {
  const defaultEnvironment: Record<string, string | undefined> = { NODE_ENV: 'test' };
  configureLocalRagProfile(defaultEnvironment, 'real', 'web');
  assert.equal(defaultEnvironment.RAG_REASONING_EFFORT, 'low');
  assert.equal(defaultEnvironment.RAG_MAX_OUTPUT_TOKENS, '2000');

  const explicitEnvironment: Record<string, string | undefined> = {
    NODE_ENV: 'test',
    RAG_REASONING_EFFORT: 'medium',
  };
  configureLocalRagProfile(explicitEnvironment, 'real', 'web');
  assert.equal(explicitEnvironment.RAG_REASONING_EFFORT, 'medium');
});

test('RAG reasoning effort is optional and validated', () => {
  const base = { NODE_ENV: 'test', DOCUMENT_EMBEDDING_DRIVER: 'fake', RAG_ANSWER_DRIVER: 'fake' };
  assert.equal(loadRagConfiguration(base).answer.reasoningEffort, undefined);
  assert.equal(
    loadRagConfiguration({ ...base, RAG_REASONING_EFFORT: 'low' }).answer.reasoningEffort,
    'low',
  );
  assert.throws(
    () => loadRagConfiguration({ ...base, RAG_REASONING_EFFORT: 'extreme' }),
    /RAG_REASONING_EFFORT has an unsupported value/u,
  );
});
