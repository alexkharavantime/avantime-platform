export const DOCUMENT_TYPES = [
  'INVOICE',
  'CREDIT_NOTE',
  'CONTRACT',
  'ACT',
  'ORDER',
  'DELIVERY_NOTE',
  'BANK_STATEMENT',
  'RECEIPT',
  'REPORT',
  'LETTER',
  'IMAGE',
  'UNKNOWN',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TEXT_EXTRACTION_METHODS = ['PDF_TEXT', 'OCR', 'NONE'] as const;
export type DocumentTextExtractionMethod = (typeof DOCUMENT_TEXT_EXTRACTION_METHODS)[number];

export const DOCUMENT_OCR_STATUSES = [
  'NOT_REQUIRED',
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'UNAVAILABLE',
] as const;
export type DocumentOcrStatus = (typeof DOCUMENT_OCR_STATUSES)[number];

export type DocumentIntelligenceMetadata = {
  detectedDocumentType: DocumentType;
  detectedMimeType: string | null;
  detectionConfidence: number | null;
  textExtractionMethod: DocumentTextExtractionMethod;
  ocrStatus: DocumentOcrStatus;
  ocrProvider: string | null;
  ocrLanguage: string | null;
  ocrStartedAt: string | null;
  ocrCompletedAt: string | null;
  pageCount: number | null;
  extractedCharacterCount: number | null;
  requiresManualReview: boolean;
  intelligenceVersion: string;
};

export function defaultDocumentIntelligenceMetadata(
  version = 'document-intelligence-v1',
): DocumentIntelligenceMetadata {
  return {
    detectedDocumentType: 'UNKNOWN',
    detectedMimeType: null,
    detectionConfidence: null,
    textExtractionMethod: 'NONE',
    ocrStatus: 'PENDING',
    ocrProvider: null,
    ocrLanguage: null,
    ocrStartedAt: null,
    ocrCompletedAt: null,
    pageCount: null,
    extractedCharacterCount: null,
    requiresManualReview: true,
    intelligenceVersion: version,
  };
}

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && DOCUMENT_TYPES.includes(value as DocumentType);
}

export function isDocumentTextExtractionMethod(
  value: unknown,
): value is DocumentTextExtractionMethod {
  return (
    typeof value === 'string' &&
    DOCUMENT_TEXT_EXTRACTION_METHODS.includes(value as DocumentTextExtractionMethod)
  );
}

export function isDocumentOcrStatus(value: unknown): value is DocumentOcrStatus {
  return typeof value === 'string' && DOCUMENT_OCR_STATUSES.includes(value as DocumentOcrStatus);
}
