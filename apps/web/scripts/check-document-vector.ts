import { getDocumentServices } from '../lib/document-services';
import { loadDocumentIntegrationEnvironment } from './document-integration-environment';

async function main() {
  if (process.argv.includes('--integration')) {
    const { environment } = await loadDocumentIntegrationEnvironment();
    Object.assign(process.env, environment);
  }
  const services = getDocumentServices();
  if (!services.rag) throw new Error('RAG services are unavailable.');
  const readiness = await services.rag.vectors.checkReadiness({
    dimensions: services.rag.configuration.embedding.dimensions,
    embeddingModel: services.rag.configuration.embedding.model,
    embeddingVersion: services.rag.configuration.embedding.version,
  });
  console.info(
    JSON.stringify({
      status: readiness.ready ? 'ready' : 'unavailable',
      extension: readiness.extension,
      storage: readiness.storage,
      dimensionsCompatible: readiness.dimensionsCompatible,
    }),
  );
  if (!readiness.ready) process.exitCode = 1;
}

void main().catch(() => {
  console.error('Document vector repository is unavailable.');
  process.exitCode = 1;
});
