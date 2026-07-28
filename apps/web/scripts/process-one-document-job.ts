import { loadDocumentWorkerConfiguration } from '../lib/document-configuration';
import type { DocumentTenantContext } from '../lib/document-model';
import { createDocumentProcessingWorker, getDocumentServices } from '../lib/document-services';

async function main() {
  const configuration = loadDocumentWorkerConfiguration();
  const tenant: DocumentTenantContext = {
    companyId: configuration.tenantId,
    userId: 'document-worker',
  };
  const result = await createDocumentProcessingWorker(getDocumentServices()).runOnce(
    tenant,
    configuration.workerId,
  );

  console.info(JSON.stringify(result));
}

void main().catch(() => {
  console.error('Document processing failed.');
  process.exitCode = 1;
});
