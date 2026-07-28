import { loadDocumentWorkerConfiguration } from '../lib/document-configuration';
import type { DocumentTenantContext } from '../lib/document-model';
import { getDocumentServices } from '../lib/document-services';
import { DocumentWorkerShutdown, runDocumentWorkerLoop } from '../lib/document-worker-runtime';

async function main() {
  const workerConfiguration = loadDocumentWorkerConfiguration();
  const tenant: DocumentTenantContext = {
    companyId: workerConfiguration.tenantId,
    userId: 'document-embedding-worker',
  };
  const services = getDocumentServices();
  if (!services.rag) throw new Error('RAG services are unavailable.');
  const worker = services.rag.createEmbeddingWorker();
  const shutdown = new DocumentWorkerShutdown();
  const stop = () => shutdown.request();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await runDocumentWorkerLoop({
      worker,
      tenant,
      workerId: `${workerConfiguration.workerId}-embedding`,
      pollIntervalMs: services.rag.configuration.embeddingQueue.pollMs,
      shutdown,
      onResult: (result) => {
        if (result.outcome === 'IDLE') return;
        console.info(
          JSON.stringify({
            outcome: result.outcome,
            documentId: result.documentId,
            jobId: result.jobId,
            embeddedChunks: result.embeddedChunks,
            errorCode: result.errorCode,
          }),
        );
      },
    });
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
  console.info(JSON.stringify({ outcome: 'STOPPED', workerId: workerConfiguration.workerId }));
}

void main().catch(() => {
  console.error('Document embedding worker failed.');
  process.exitCode = 1;
});
