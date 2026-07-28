import {
  loadDocumentConfiguration,
  loadDocumentWorkerConfiguration,
} from './document-configuration';
import type { DocumentTenantContext } from './document-model';
import { getDocumentServices, type DocumentServices } from './document-services';

export type DocumentReadinessStatus = 'ready' | 'unavailable';
export type DocumentComponentStatus = DocumentReadinessStatus | 'disabled';

export type DocumentReadiness = {
  status: DocumentReadinessStatus;
  components: {
    core: {
      status: DocumentReadinessStatus;
      configuration: DocumentReadinessStatus;
      worker: DocumentReadinessStatus;
      metadata: DocumentReadinessStatus;
      storage: DocumentReadinessStatus;
      queue: DocumentReadinessStatus;
    };
    documentIntelligence: {
      status: DocumentComponentStatus;
      requiredForReadiness: boolean;
      textQuality: DocumentReadinessStatus;
      typeDetection: DocumentReadinessStatus;
      ocr: {
        status: DocumentComponentStatus;
        runtime: DocumentComponentStatus;
        languages: DocumentComponentStatus;
        pdfSupport: DocumentComponentStatus;
      };
    };
  };
};

async function check(action: () => Promise<unknown>): Promise<DocumentReadinessStatus> {
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
  const readiness: DocumentReadiness = {
    status: 'unavailable',
    components: {
      core: {
        status: 'unavailable',
        configuration: 'unavailable',
        worker: 'unavailable',
        metadata: 'unavailable',
        storage: 'unavailable',
        queue: 'unavailable',
      },
      documentIntelligence: {
        status: 'unavailable',
        requiredForReadiness: true,
        textQuality: 'unavailable',
        typeDetection: 'unavailable',
        ocr: {
          status: 'unavailable',
          runtime: 'unavailable',
          languages: 'unavailable',
          pdfSupport: 'unavailable',
        },
      },
    },
  };
  const { core, documentIntelligence } = readiness.components;
  const configurationLoader = dependencies.loadConfiguration ?? loadDocumentConfiguration;
  const workerConfigurationLoader =
    dependencies.loadWorkerConfiguration ?? loadDocumentWorkerConfiguration;
  const servicesLoader = dependencies.loadServices ?? getDocumentServices;

  let configuration: ReturnType<typeof loadDocumentConfiguration>;
  try {
    configuration = configurationLoader();
    core.configuration = 'ready';
    documentIntelligence.requiredForReadiness = configuration.ocrRequiredForReadiness;
    documentIntelligence.textQuality =
      configuration.textQuality.minimumCharacters > 0 &&
      configuration.textQuality.minimumPrintableRatio >= 0 &&
      configuration.textQuality.minimumAlphanumericRatio >= 0
        ? 'ready'
        : 'unavailable';
    documentIntelligence.typeDetection =
      configuration.detectionMinimumConfidence >= 0 ? 'ready' : 'unavailable';
    if (configuration.ocr.driver === 'disabled') {
      documentIntelligence.status = 'disabled';
      documentIntelligence.ocr = {
        status: 'disabled',
        runtime: 'disabled',
        languages: 'disabled',
        pdfSupport: 'disabled',
      };
    }
  } catch {
    return readiness;
  }

  let tenant: DocumentTenantContext;
  try {
    const worker = workerConfigurationLoader();
    tenant = {
      companyId: worker.tenantId,
      userId: 'document-health',
    };
    core.worker = 'ready';
  } catch {
    return readiness;
  }

  let services: DocumentServices;
  try {
    services = servicesLoader();
  } catch {
    return readiness;
  }

  core.metadata = await check(() => services.metadata.list(tenant));
  core.storage = await check(() =>
    services.storage.read(tenant, 'history', 'document-health-check.json'),
  );
  core.queue = await check(() => services.queue.list(tenant));
  core.status = [core.configuration, core.worker, core.metadata, core.storage, core.queue].every(
    (status) => status === 'ready',
  )
    ? 'ready'
    : 'unavailable';

  if (configuration.ocr.driver !== 'disabled' && services.ocr) {
    try {
      const ocr = await services.ocr.checkAvailability();
      documentIntelligence.ocr.runtime =
        (ocr.runtimeAvailable ?? ocr.available) ? 'ready' : 'unavailable';
      documentIntelligence.ocr.languages = configuration.ocr.languages.every((language) =>
        ocr.languages.includes(language),
      )
        ? 'ready'
        : 'unavailable';
      documentIntelligence.ocr.pdfSupport = ocr.pdfSupported ? 'ready' : 'unavailable';
    } catch {
      documentIntelligence.ocr.runtime = 'unavailable';
      documentIntelligence.ocr.languages = 'unavailable';
      documentIntelligence.ocr.pdfSupport = 'unavailable';
    }
    documentIntelligence.ocr.status = [
      documentIntelligence.ocr.runtime,
      documentIntelligence.ocr.languages,
      documentIntelligence.ocr.pdfSupport,
    ].every((status) => status === 'ready')
      ? 'ready'
      : 'unavailable';
    documentIntelligence.status =
      documentIntelligence.textQuality === 'ready' &&
      documentIntelligence.typeDetection === 'ready' &&
      documentIntelligence.ocr.status === 'ready'
        ? 'ready'
        : 'unavailable';
  }

  readiness.status =
    core.status === 'ready' &&
    documentIntelligence.textQuality === 'ready' &&
    documentIntelligence.typeDetection === 'ready' &&
    (!documentIntelligence.requiredForReadiness || documentIntelligence.status === 'ready')
      ? 'ready'
      : 'unavailable';
  return readiness;
}
