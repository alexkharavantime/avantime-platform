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
    embeddingVector: {
      status: DocumentComponentStatus;
      requiredForReadiness: boolean;
      providerConfigured: DocumentComponentStatus;
      providerAvailable: DocumentComponentStatus;
      vectorRepository: DocumentComponentStatus;
      pgvectorExtension: DocumentComponentStatus;
      dimensionsCompatible: DocumentComponentStatus;
      worker: DocumentComponentStatus;
    };
    rag: {
      status: DocumentComponentStatus;
      requiredForReadiness: boolean;
      configuration: DocumentComponentStatus;
      aiGateway: DocumentComponentStatus;
      answerProvider: DocumentComponentStatus;
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
      embeddingVector: {
        status: 'unavailable',
        requiredForReadiness: true,
        providerConfigured: 'unavailable',
        providerAvailable: 'unavailable',
        vectorRepository: 'unavailable',
        pgvectorExtension: 'unavailable',
        dimensionsCompatible: 'unavailable',
        worker: 'unavailable',
      },
      rag: {
        status: 'unavailable',
        requiredForReadiness: true,
        configuration: 'unavailable',
        aiGateway: 'unavailable',
        answerProvider: 'unavailable',
      },
    },
  };
  const { core, documentIntelligence, embeddingVector, rag } = readiness.components;
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

  if (services.rag) {
    embeddingVector.requiredForReadiness = services.rag.configuration.requiredForReadiness;
    rag.requiredForReadiness = services.rag.configuration.requiredForReadiness;
    rag.configuration = 'ready';
    if (services.rag.configuration.embedding.driver === 'disabled') {
      embeddingVector.status = 'disabled';
      embeddingVector.providerConfigured = 'disabled';
      embeddingVector.providerAvailable = 'disabled';
      embeddingVector.vectorRepository =
        services.rag.configuration.vector.driver === 'memory' ? 'disabled' : 'unavailable';
      embeddingVector.pgvectorExtension =
        services.rag.configuration.vector.driver === 'memory' ? 'disabled' : 'unavailable';
      embeddingVector.dimensionsCompatible =
        services.rag.configuration.vector.driver === 'memory' ? 'disabled' : 'unavailable';
      embeddingVector.worker = 'disabled';
    } else {
      try {
        const [gateway, vector, worker] = await Promise.all([
          services.rag.gateway.checkReadiness(),
          services.rag.vectors.checkReadiness({
            dimensions: services.rag.configuration.embedding.dimensions,
            embeddingModel: services.rag.configuration.embedding.model,
            embeddingVersion: services.rag.configuration.embedding.version,
          }),
          services.rag.embeddingQueue.checkReadiness(),
        ]);
        embeddingVector.providerConfigured = gateway.embedding.configured ? 'ready' : 'unavailable';
        embeddingVector.providerAvailable = gateway.embedding.available ? 'ready' : 'unavailable';
        embeddingVector.vectorRepository = vector.storage ? 'ready' : 'unavailable';
        embeddingVector.pgvectorExtension =
          services.rag.configuration.vector.driver === 'pgvector'
            ? vector.extension
              ? 'ready'
              : 'unavailable'
            : 'disabled';
        embeddingVector.dimensionsCompatible = vector.dimensionsCompatible
          ? 'ready'
          : 'unavailable';
        embeddingVector.worker = worker ? 'ready' : 'unavailable';
        embeddingVector.status = [
          embeddingVector.providerConfigured,
          embeddingVector.providerAvailable,
          embeddingVector.vectorRepository,
          embeddingVector.dimensionsCompatible,
          embeddingVector.worker,
        ].every((status) => status === 'ready')
          ? 'ready'
          : 'unavailable';
        rag.aiGateway =
          gateway.embedding.configured && gateway.answer.configured ? 'ready' : 'unavailable';
        rag.answerProvider = gateway.answer.available ? 'ready' : 'unavailable';
      } catch {
        embeddingVector.status = 'unavailable';
      }
    }
    if (services.rag.configuration.answer.driver === 'disabled') {
      rag.status = 'disabled';
      rag.aiGateway = 'disabled';
      rag.answerProvider = 'disabled';
    } else {
      rag.status =
        rag.configuration === 'ready' &&
        rag.aiGateway === 'ready' &&
        rag.answerProvider === 'ready' &&
        embeddingVector.status === 'ready'
          ? 'ready'
          : 'unavailable';
    }
  }

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
    (!documentIntelligence.requiredForReadiness || documentIntelligence.status === 'ready') &&
    (!embeddingVector.requiredForReadiness || embeddingVector.status === 'ready') &&
    (!rag.requiredForReadiness || rag.status === 'ready')
      ? 'ready'
      : 'unavailable';
  return readiness;
}
