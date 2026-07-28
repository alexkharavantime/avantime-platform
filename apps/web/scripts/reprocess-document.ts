import { loadDocumentWorkerConfiguration } from '../lib/document-configuration';
import { reprocessDocument } from '../lib/document-services';
import { assertSafeDocumentSegment } from '../lib/document-storage';

function argument(name: string) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function main() {
  const documentId = argument('--id');
  if (!documentId) throw new Error('--id is required.');
  assertSafeDocumentSegment(documentId, 'documentId');
  const worker = loadDocumentWorkerConfiguration();
  const result = await reprocessDocument(
    { companyId: worker.tenantId, userId: 'document-reprocess-cli' },
    documentId,
    { dryRun: process.argv.includes('--dry-run') },
  );
  console.log(JSON.stringify(result));
  if (result.outcome === 'NOT_FOUND') process.exitCode = 2;
}

main().catch(() => {
  console.error('Document reprocess command failed.');
  process.exitCode = 1;
});
