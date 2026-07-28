import type { DocumentType } from './document-intelligence-model';

export type DocumentTypeDetectorInput = {
  text: string;
  detectedMimeType: string;
};

export type DocumentTypeDetectorResult = {
  documentType: DocumentType;
  confidence: number;
  requiresManualReview: boolean;
};

export interface DocumentTypeDetector {
  detect(input: DocumentTypeDetectorInput): DocumentTypeDetectorResult;
}

const RULES: ReadonlyArray<{ type: DocumentType; patterns: readonly RegExp[] }> = [
  { type: 'CREDIT_NOTE', patterns: [/credit note/i, /кредитн(?:ая|ый) нот/i] },
  { type: 'INVOICE', patterns: [/\binvoice\b/i, /сч[её]т(?:-фактура)?/i, /\br[ēeķ]ins\b/i] },
  { type: 'CONTRACT', patterns: [/\bcontract\b/i, /договор/i, /\bl[īi]gums\b/i] },
  { type: 'ACT', patterns: [/\bакт\b/i, /pieņemšanas.*nodošanas/i] },
  { type: 'ORDER', patterns: [/\border\b/i, /заказ/i, /pasūtījums/i] },
  { type: 'DELIVERY_NOTE', patterns: [/delivery note/i, /накладн/i, /pavadzīme/i] },
  { type: 'BANK_STATEMENT', patterns: [/bank statement/i, /выписк[аи].*банк/i, /konta izraksts/i] },
  { type: 'RECEIPT', patterns: [/\breceipt\b/i, /кассовый чек/i, /čeks/i] },
  { type: 'REPORT', patterns: [/\breport\b/i, /отч[её]т/i, /pārskats/i] },
  { type: 'LETTER', patterns: [/\bdear\b/i, /уважаем/i, /cienījam/i] },
];

export class DefaultDocumentTypeDetector implements DocumentTypeDetector {
  constructor(private readonly minimumConfidence: number) {}

  detect(input: DocumentTypeDetectorInput): DocumentTypeDetectorResult {
    const scored = RULES.map((rule) => ({
      type: rule.type,
      matches: rule.patterns.filter((pattern) => pattern.test(input.text)).length,
    })).sort((first, second) => second.matches - first.matches)[0];
    const image = input.detectedMimeType.startsWith('image/');
    const documentType = scored?.matches ? scored.type : image ? 'IMAGE' : 'UNKNOWN';
    const confidence = scored?.matches
      ? Math.min(0.55 + scored.matches * 0.2, 0.95)
      : image
        ? 0.7
        : 0;

    return {
      documentType,
      confidence,
      requiresManualReview: documentType === 'UNKNOWN' || confidence < this.minimumConfidence,
    };
  }
}
