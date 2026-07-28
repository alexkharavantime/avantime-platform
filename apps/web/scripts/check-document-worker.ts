import {
  loadDocumentConfiguration,
  loadDocumentWorkerConfiguration,
} from '../lib/document-configuration';
import { loadDocumentIntegrationEnvironment } from './document-integration-environment';

async function main() {
  if (process.argv.includes('--integration')) {
    const { environment } = await loadDocumentIntegrationEnvironment();
    Object.assign(process.env, environment);
  }
  const configuration = loadDocumentConfiguration();
  const worker = loadDocumentWorkerConfiguration();

  console.info(
    JSON.stringify({
      status: 'ready',
      storageDriver: configuration.storageDriver,
      metadataDriver: configuration.metadataDriver,
      queueDriver: configuration.queueDriver,
      tenantConfigured: Boolean(worker.tenantId),
      workerConfigured: Boolean(worker.workerId),
    }),
  );
}

void main().catch(() => {
  console.error('Document worker configuration is unavailable.');
  process.exitCode = 1;
});
