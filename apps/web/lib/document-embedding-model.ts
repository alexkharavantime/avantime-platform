export const DOCUMENT_EMBEDDING_STATUSES = [
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'QUARANTINED',
  'DISABLED',
] as const;

export type DocumentEmbeddingStatus = (typeof DOCUMENT_EMBEDDING_STATUSES)[number];

export function isDocumentEmbeddingStatus(value: unknown): value is DocumentEmbeddingStatus {
  return (
    typeof value === 'string' &&
    DOCUMENT_EMBEDDING_STATUSES.includes(value as DocumentEmbeddingStatus)
  );
}
