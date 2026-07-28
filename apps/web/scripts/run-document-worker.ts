import { loadDocumentWorkerConfiguration } from '../lib/document-configuration';
import type { DocumentTenantContext } from '../lib/document-model';
import { createDocumentProcessingWorker, getDocumentServices } from '../lib/document-services';
import { DocumentWorkerShutdown, runDocumentWorkerLoop } from '../lib/document-worker-runtime';

async function main() {
  const configuration = loadDocumentWorkerConfiguration();
  const tenant: DocumentTenantContext = {
    companyId: configuration.tenantId,
    userId: 'document-worker',
  };
  const services = getDocumentServices();
  const worker = createDocumentProcessingWorker(services);
  const shutdown = new DocumentWorkerShutdown();
  const stop = () => shutdown.request();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    await runDocumentWorkerLoop({
      worker,
      tenant,
      workerId: configuration.workerId,
      pollIntervalMs: services.workerPollIntervalMs,
      shutdown,
      onResult: (result) => {
        if (result.outcome === 'IDLE') return;
        console.info(
          JSON.stringify({
            outcome: result.outcome,
            documentId: result.documentId,
            jobId: result.jobId,
            errorCode: result.errorCode,
          }),
        );
      },
    });
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }

  console.info(
    JSON.stringify({
      outcome: 'STOPPED',
      workerId: configuration.workerId,
    }),
  );
}

void main().catch(() => {
  console.error('Document worker failed.');
  process.exitCode = 1;
});
