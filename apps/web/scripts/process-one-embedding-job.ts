import { loadDocumentWorkerConfiguration } from '../lib/document-configuration';
import { getDocumentServices } from '../lib/document-services';

async function main() {
  const workerConfiguration = loadDocumentWorkerConfiguration();
  const services = getDocumentServices();
  if (!services.rag) throw new Error('RAG services are unavailable.');
  const result = await services.rag.createEmbeddingWorker().runOnce(
    {
      companyId: workerConfiguration.tenantId,
      userId: 'document-embedding-worker',
    },
    `${workerConfiguration.workerId}-embedding`,
  );
  console.info(JSON.stringify(result));
}

void main().catch(() => {
  console.error('Embedding job processing failed.');
  process.exitCode = 1;
});
