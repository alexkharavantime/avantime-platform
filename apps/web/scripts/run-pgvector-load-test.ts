import { getPrisma } from '@avantime/database';

import { runPgvectorLoadTest } from '../lib/pgvector-load-test';
import { loadDocumentIntegrationEnvironment } from './document-integration-environment';

async function main() {
  const smoke = process.argv.includes('--smoke');
  if (process.argv.includes('--integration')) {
    const { environment } = await loadDocumentIntegrationEnvironment();
    Object.assign(process.env, environment, { PGVECTOR_LOAD_TEST_ALLOWED: 'true' });
  }
  if (process.env.PGVECTOR_LOAD_TEST_ALLOWED !== 'true') {
    console.error(
      JSON.stringify({
        status: 'blocked',
        errorCode: 'PGVECTOR_LOAD_TEST_NOT_ALLOWED',
      }),
    );
    process.exitCode = 2;
    return;
  }
  try {
    const metrics = await runPgvectorLoadTest(async () => await getPrisma(), {
      tenants: Number(process.env.PGVECTOR_LOAD_TENANTS || (smoke ? 2 : 10)),
      documentsPerTenant: Number(process.env.PGVECTOR_LOAD_DOCUMENTS || (smoke ? 3 : 100)),
      chunksPerDocument: Number(process.env.PGVECTOR_LOAD_CHUNKS || (smoke ? 4 : 50)),
      dimensions: Number(process.env.PGVECTOR_LOAD_DIMENSIONS || 32),
      concurrentQueries: Number(process.env.PGVECTOR_LOAD_CONCURRENCY || (smoke ? 2 : 16)),
      queryCount: Number(process.env.PGVECTOR_LOAD_QUERIES || (smoke ? 6 : 500)),
      topK: Number(process.env.PGVECTOR_LOAD_TOP_K || 5),
      seed: Number(process.env.PGVECTOR_LOAD_SEED || 42),
      strategies: smoke ? ['exact'] : ['exact', 'ivfflat', 'hnsw'],
    });
    console.log(JSON.stringify({ status: 'completed', metrics }, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        status: 'failed',
        errorCode: 'PGVECTOR_LOAD_TEST_FAILED',
        message: error instanceof Error ? error.message : 'Load test failed.',
      }),
    );
    process.exitCode = 1;
  }
}

void main();
