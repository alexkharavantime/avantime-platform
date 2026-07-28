export const DOCUMENT_PROCESSING_STATUSES = [
  'UPLOADED',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'QUARANTINED',
  'DELETED',
] as const;

export type DocumentProcessingStatus = (typeof DOCUMENT_PROCESSING_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<DocumentProcessingStatus, readonly DocumentProcessingStatus[]> = {
  UPLOADED: ['QUEUED', 'FAILED', 'QUARANTINED', 'DELETED'],
  QUEUED: ['PROCESSING', 'FAILED', 'QUARANTINED', 'DELETED'],
  PROCESSING: ['PROCESSING', 'QUEUED', 'COMPLETED', 'FAILED', 'QUARANTINED', 'DELETED'],
  COMPLETED: ['QUEUED', 'DELETED'],
  FAILED: ['QUEUED', 'QUARANTINED', 'DELETED'],
  QUARANTINED: ['QUEUED', 'COMPLETED', 'FAILED', 'DELETED'],
  DELETED: [],
};

export function isDocumentProcessingStatus(value: unknown): value is DocumentProcessingStatus {
  return (
    typeof value === 'string' &&
    DOCUMENT_PROCESSING_STATUSES.includes(value as DocumentProcessingStatus)
  );
}

export function assertDocumentProcessingStatus(
  value: unknown,
): asserts value is DocumentProcessingStatus {
  if (!isDocumentProcessingStatus(value)) {
    throw new Error('Unsupported document processing status.');
  }
}

export function assertDocumentStatusTransition(
  current: DocumentProcessingStatus,
  next: DocumentProcessingStatus,
) {
  assertDocumentProcessingStatus(current);
  assertDocumentProcessingStatus(next);

  if (current === next) return;
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid document status transition: ${current} -> ${next}.`);
  }
}

export function canTransitionDocumentStatus(
  current: DocumentProcessingStatus,
  next: DocumentProcessingStatus,
) {
  try {
    assertDocumentStatusTransition(current, next);
    return true;
  } catch {
    return false;
  }
}
