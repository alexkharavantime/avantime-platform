import { checkDocumentReadiness } from '../lib/document-health';
import { loadDocumentIntegrationEnvironment } from './document-integration-environment';

async function main() {
  if (process.argv.includes('--integration')) {
    const { environment } = await loadDocumentIntegrationEnvironment();
    Object.assign(process.env, environment);
  }
  const readiness = await checkDocumentReadiness();
  console.info(JSON.stringify(readiness));
  if (readiness.status !== 'ready') process.exitCode = 1;
}

void main().catch(() => {
  console.error('Document health check failed.');
  process.exitCode = 1;
});
