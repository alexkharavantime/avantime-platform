import { getDocumentServices } from '../lib/document-services';
import { loadDocumentIntegrationEnvironment } from './document-integration-environment';

async function main() {
  if (process.argv.includes('--integration')) {
    const { environment } = await loadDocumentIntegrationEnvironment();
    Object.assign(process.env, environment);
  }
  const services = getDocumentServices();
  if (!services.rag) throw new Error('RAG services are unavailable.');
  const [gateway, queue] = await Promise.all([
    services.rag.gateway.checkReadiness(),
    services.rag.embeddingQueue.checkReadiness(),
  ]);
  const ready = gateway.embedding.configured && gateway.embedding.available && queue;
  console.info(
    JSON.stringify({
      status: ready ? 'ready' : 'unavailable',
      providerConfigured: gateway.embedding.configured,
      providerAvailable: gateway.embedding.available,
      workerQueueReady: queue,
      dimensions: services.rag.configuration.embedding.dimensions,
    }),
  );
  if (!ready) process.exitCode = 1;
}

void main().catch(() => {
  console.error('Document embedding configuration is unavailable.');
  process.exitCode = 1;
});
