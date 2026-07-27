import { AVANTIME_DOCUMENT_COMPANY_ID, type DocumentTenantContext } from '../lib/document-model';
import { cleanupDeletedDocuments, getDocumentServices } from '../lib/document-services';

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const tenant: DocumentTenantContext = {
    companyId:
      argumentValue('tenant') ?? process.env.CLEANUP_TENANT_ID ?? AVANTIME_DOCUMENT_COMPANY_ID,
    userId: 'document-cleanup',
  };
  const services = getDocumentServices();

  if (process.argv.includes('--dry-run')) {
    const documents = await services.metadata.listDeleted(tenant);
    console.info(
      JSON.stringify({
        tenant: tenant.companyId,
        dryRun: true,
        documents: documents.map((document) => document.id),
      }),
    );
    return;
  }

  const result = await cleanupDeletedDocuments(tenant, services);
  console.info(
    JSON.stringify({
      tenant: tenant.companyId,
      dryRun: false,
      cleaned: result.cleaned,
      failed: result.failed,
    }),
  );
  if (result.failed.length > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Document cleanup failed.');
  process.exitCode = 1;
});
