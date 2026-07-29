import type { DocumentMetadata, TextChunk } from './document-model';
import { detectDocumentFile } from './document-file-detection';
import type { DocumentIntelligenceMetadata } from './document-intelligence-model';
import type { DocumentOcrService } from './document-ocr';
import { DocumentProcessingError } from './document-processing-errors';
import type { DocumentTextQualityService } from './document-text-quality';
import { normalizeDocumentText } from './document-text-normalization';
import type { DocumentTypeDetector } from './document-type-detection';
import { extractPdfText, splitPagesIntoChunks } from './pdf-extractor';

export type DocumentIntelligenceResult = {
  text: string;
  chunks: TextChunk[];
  chunksCount: number;
  intelligence: DocumentIntelligenceMetadata;
};

export interface DocumentIntelligenceService {
  process(document: DocumentMetadata, content: Buffer): Promise<DocumentIntelligenceResult>;
}

export type DocumentIntelligenceDependencies = {
  quality: DocumentTextQualityService;
  typeDetector: DocumentTypeDetector;
  ocr: DocumentOcrService;
  version: string;
  now?: () => Date;
};

export class DefaultDocumentIntelligenceService implements DocumentIntelligenceService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: DocumentIntelligenceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async process(document: DocumentMetadata, content: Buffer): Promise<DocumentIntelligenceResult> {
    const file = detectDocumentFile({
      content,
      originalName: document.originalName,
      declaredMimeType: document.mimeType,
    });
    if (!file.processable) {
      throw new DocumentProcessingError(
        'UNSUPPORTED_DOCUMENT_FORMAT',
        false,
        'Формат документа распознан, но пока не поддерживается.',
      );
    }

    let text = '';
    let pageTexts: string[] = [];
    let pageCount = file.format === 'PDF' ? 0 : 1;
    let extractionMethod: DocumentIntelligenceMetadata['textExtractionMethod'] = 'NONE';
    let ocrStatus: DocumentIntelligenceMetadata['ocrStatus'] = 'PENDING';
    let ocrProvider: string | null = null;
    let ocrLanguage: string | null = null;
    let ocrStartedAt: string | null = null;
    let ocrCompletedAt: string | null = null;

    if (file.format === 'PDF') {
      const extracted = await extractPdfText(content);
      text = extracted.text;
      pageTexts = extracted.pageTexts ?? [extracted.text];
      pageCount = extracted.pages;
    }

    const quality = this.dependencies.quality.assess({ text, pageCount });
    const mustOcr = file.format !== 'PDF' || quality.requiresOcr;
    if (mustOcr) {
      ocrStartedAt = this.now().toISOString();
      const recognized = await this.dependencies.ocr.recognize({
        content,
        mimeType: file.detectedMimeType as 'application/pdf' | 'image/png' | 'image/jpeg',
      });
      text = recognized.text;
      pageTexts = recognized.text.split(/\f/);
      pageCount = recognized.pageCount;
      ocrProvider = recognized.provider;
      ocrLanguage = recognized.language;
      ocrCompletedAt = this.now().toISOString();
      ocrStatus = 'COMPLETED';
      extractionMethod = 'OCR';
    } else {
      ocrStatus = 'NOT_REQUIRED';
      extractionMethod = 'PDF_TEXT';
    }

    const paged = splitPagesIntoChunks(
      pageTexts.length > 0
        ? pageTexts.map((page) => normalizeDocumentText(page))
        : [normalizeDocumentText(text)],
      extractionMethod === 'OCR' ? 'OCR' : 'PDF_TEXT',
    );
    const normalized = paged.text;
    const finalQuality = this.dependencies.quality.assess({ text: normalized, pageCount });
    if (mustOcr && !finalQuality.sufficient) {
      throw new DocumentProcessingError(
        'OCR_TEXT_QUALITY_INSUFFICIENT',
        false,
        'OCR не смог получить текст достаточного качества; требуется ручная проверка.',
      );
    }
    const type = this.dependencies.typeDetector.detect({
      text: normalized,
      detectedMimeType: file.detectedMimeType,
    });
    const requiresManualReview =
      file.mismatch || finalQuality.requiresManualReview || type.requiresManualReview;
    const chunks = paged.chunks;

    return {
      text: normalized,
      chunks,
      chunksCount: chunks.length,
      intelligence: {
        detectedDocumentType: type.documentType,
        detectedMimeType: file.detectedMimeType,
        detectionConfidence: type.confidence,
        textExtractionMethod: extractionMethod,
        ocrStatus,
        ocrProvider,
        ocrLanguage,
        ocrStartedAt,
        ocrCompletedAt,
        pageCount,
        extractedCharacterCount: normalized.length,
        requiresManualReview,
        intelligenceVersion: this.dependencies.version,
      },
    };
  }
}
