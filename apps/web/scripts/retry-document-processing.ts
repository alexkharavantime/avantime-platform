import { loadDocumentWorkerConfiguration } from '../lib/document-configuration';
import type { DocumentTenantContext } from '../lib/document-model';
import { retryDocumentProcessing } from '../lib/document-quarantine';
import { getDocumentServices } from '../lib/document-services';

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const documentId = argumentValue('document-id');
  if (!documentId) {
    throw new Error('--document-id is required.');
  }

  const configuration = loadDocumentWorkerConfiguration();
  const tenant: DocumentTenantContext = {
    companyId: configuration.tenantId,
    userId: 'document-retry',
  };
  const result = await retryDocumentProcessing(tenant, documentId, getDocumentServices(), {
    dryRun: process.argv.includes('--dry-run'),
  });
  if (!result) {
    throw new Error('A failed or quarantined document was not found.');
  }

  console.info(
    JSON.stringify({
      documentId: result.document.id,
      previousStatus: result.dryRun ? result.document.status : undefined,
      status: result.document.status,
      dryRun: result.dryRun,
      enqueued: result.enqueued,
    }),
  );
}

void main().catch(() => {
  console.error('Document retry failed.');
  process.exitCode = 1;
});
