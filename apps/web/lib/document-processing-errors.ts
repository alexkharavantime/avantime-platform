export type DocumentProcessingErrorClassification = {
  code: string;
  retryable: boolean;
  safeMessage: string;
};

export class DocumentProcessingError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly safeMessage: string,
    options: ErrorOptions = {},
  ) {
    super(safeMessage, options);
    this.name = 'DocumentProcessingError';
  }
}

const TRANSIENT_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'THROTTLING',
  'SERVICE_UNAVAILABLE',
]);

function errorCode(error: Error) {
  if ('code' in error && typeof (error as Error & { code?: unknown }).code === 'string') {
    return (error as Error & { code: string }).code.toUpperCase();
  }

  return '';
}

function httpStatus(error: Error) {
  if (!('$metadata' in error)) return undefined;
  return (error as Error & { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
}

export function classifyDocumentProcessingError(
  error: unknown,
): DocumentProcessingErrorClassification {
  if (error instanceof DocumentProcessingError) {
    return {
      code: error.code,
      retryable: error.retryable,
      safeMessage: error.safeMessage,
    };
  }

  if (!(error instanceof Error)) {
    return {
      code: 'INTERNAL_PROCESSING_ERROR',
      retryable: true,
      safeMessage: 'Временная ошибка обработки документа.',
    };
  }

  const code = errorCode(error);
  const status = httpStatus(error);
  const normalizedMessage = error.message.toLowerCase();

  if (normalizedMessage.includes('checksum verification failed')) {
    return {
      code: 'CHECKSUM_MISMATCH',
      retryable: false,
      safeMessage: 'Нарушена целостность исходного файла.',
    };
  }

  if (
    normalizedMessage.includes('invalid pdf') ||
    normalizedMessage.includes('invalidpdf') ||
    normalizedMessage.includes('password') ||
    normalizedMessage.includes('unsupported document')
  ) {
    return {
      code: 'INVALID_DOCUMENT',
      retryable: false,
      safeMessage: 'Документ повреждён или не поддерживается.',
    };
  }

  if (
    TRANSIENT_ERROR_CODES.has(code) ||
    status === 429 ||
    (status !== undefined && status >= 500)
  ) {
    return {
      code: code || 'STORAGE_TEMPORARILY_UNAVAILABLE',
      retryable: true,
      safeMessage: 'Временная ошибка доступа к хранилищу.',
    };
  }

  return {
    code: 'INTERNAL_PROCESSING_ERROR',
    retryable: true,
    safeMessage: 'Временная ошибка обработки документа.',
  };
}
