import { planDocumentReindex } from '../lib/document-embedding';
import { loadDocumentWorkerConfiguration } from '../lib/document-configuration';
import { getDocumentServices } from '../lib/document-services';
import { loadDocumentIntegrationEnvironment } from './document-integration-environment';

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function assertSafeTarget(dryRun: boolean) {
  if (dryRun) return;
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_PRODUCTION_DOCUMENT_REINDEX !== '1'
  ) {
    throw new Error('Production reindex requires ALLOW_PRODUCTION_DOCUMENT_REINDEX=1.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const hostname = new URL(databaseUrl).hostname;
    const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (!local && process.env.ALLOW_REMOTE_DOCUMENT_REINDEX !== '1') {
      throw new Error('Remote database reindex requires ALLOW_REMOTE_DOCUMENT_REINDEX=1.');
    }
  }
}

async function main() {
  if (process.argv.includes('--integration')) {
    const { environment } = await loadDocumentIntegrationEnvironment();
    Object.assign(process.env, environment);
  }
  const documentId = argument('document-id');
  if (!documentId) throw new Error('--document-id is required.');
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--execute');
  assertSafeTarget(dryRun);
  const worker = loadDocumentWorkerConfiguration();
  const services = getDocumentServices();
  if (!services.rag) throw new Error('RAG services are unavailable.');
  const result = await planDocumentReindex(
    {
      companyId: worker.tenantId,
      userId: 'document-reindex',
    },
    documentId,
    dryRun,
    services.rag.embedding,
  );
  console.info(JSON.stringify(result));
  if (result.outcome === 'NOT_FOUND' || result.outcome === 'NOT_ELIGIBLE') {
    process.exitCode = 2;
  }
}

void main().catch(() => {
  console.error('Document reindex failed.');
  process.exitCode = 1;
});
