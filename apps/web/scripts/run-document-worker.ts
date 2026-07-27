import { loadDocumentWorkerConfiguration } from '../lib/document-configuration';
import type { DocumentTenantContext } from '../lib/document-model';
import { createDocumentProcessingWorker, getDocumentServices } from '../lib/document-services';

async function wait(milliseconds: number) {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function main() {
  const configuration = loadDocumentWorkerConfiguration();
  const tenant: DocumentTenantContext = {
    companyId: configuration.tenantId,
    userId: 'document-worker',
  };
  const services = getDocumentServices();
  const worker = createDocumentProcessingWorker(services);
  let stopping = false;

  const stop = () => {
    stopping = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  while (!stopping) {
    const result = await worker.runOnce(tenant, configuration.workerId);
    if (result.outcome === 'IDLE') {
      await wait(services.workerPollIntervalMs);
      continue;
    }

    console.info(
      JSON.stringify({
        outcome: result.outcome,
        documentId: result.documentId,
        jobId: result.jobId,
        errorCode: result.errorCode,
      }),
    );
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
