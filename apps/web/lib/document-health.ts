import {
  loadDocumentConfiguration,
  loadDocumentWorkerConfiguration,
} from './document-configuration';
import type { DocumentTenantContext } from './document-model';
import { getDocumentServices, type DocumentServices } from './document-services';

export type DocumentHealthComponent = 'configuration' | 'worker' | 'metadata' | 'storage' | 'queue';
export type DocumentHealthStatus = 'ready' | 'unavailable';

export type DocumentReadiness = {
  status: DocumentHealthStatus;
  components: Record<DocumentHealthComponent, DocumentHealthStatus>;
};

async function check(action: () => Promise<unknown>): Promise<DocumentHealthStatus> {
  try {
    await action();
    return 'ready';
  } catch {
    return 'unavailable';
  }
}

export async function checkDocumentReadiness(
  dependencies: {
    loadConfiguration?: typeof loadDocumentConfiguration;
    loadWorkerConfiguration?: typeof loadDocumentWorkerConfiguration;
    loadServices?: () => DocumentServices;
  } = {},
): Promise<DocumentReadiness> {
  const components: DocumentReadiness['components'] = {
    configuration: 'unavailable',
    worker: 'unavailable',
    metadata: 'unavailable',
    storage: 'unavailable',
    queue: 'unavailable',
  };
  const configurationLoader = dependencies.loadConfiguration ?? loadDocumentConfiguration;
  const workerConfigurationLoader =
    dependencies.loadWorkerConfiguration ?? loadDocumentWorkerConfiguration;
  const servicesLoader = dependencies.loadServices ?? getDocumentServices;

  try {
    configurationLoader();
    components.configuration = 'ready';
  } catch {
    return {
      status: 'unavailable',
      components,
    };
  }

  let tenant: DocumentTenantContext;
  try {
    const worker = workerConfigurationLoader();
    tenant = {
      companyId: worker.tenantId,
      userId: 'document-health',
    };
    components.worker = 'ready';
  } catch {
    return {
      status: 'unavailable',
      components,
    };
  }

  let services: DocumentServices;
  try {
    services = servicesLoader();
  } catch {
    return {
      status: 'unavailable',
      components,
    };
  }

  components.metadata = await check(() => services.metadata.list(tenant));
  components.storage = await check(() =>
    services.storage.read(tenant, 'history', 'document-health-check.json'),
  );
  components.queue = await check(() => services.queue.list(tenant));

  return {
    status: Object.values(components).every((status) => status === 'ready')
      ? 'ready'
      : 'unavailable',
    components,
  };
}
