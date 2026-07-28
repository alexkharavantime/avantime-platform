import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { detectDocumentFile } from '../lib/document-file-detection';
import { DefaultDocumentIntelligenceService } from '../lib/document-intelligence';
import { defaultDocumentIntelligenceMetadata } from '../lib/document-intelligence-model';
import type { DocumentOcrAvailability, DocumentOcrProvider } from '../lib/document-ocr';
import { DefaultDocumentOcrService, TesseractDocumentOcrProvider } from '../lib/document-ocr';
import { DefaultDocumentTextQualityService } from '../lib/document-text-quality';
import { normalizeDocumentText } from '../lib/document-text-normalization';
import { DefaultDocumentTypeDetector } from '../lib/document-type-detection';
import type { DocumentMetadata } from '../lib/document-model';

const quality = new DefaultDocumentTextQualityService({
  minimumCharacters: 20,
  minimumPrintableRatio: 0.9,
  minimumAlphanumericRatio: 0.2,
});

class FakeOcrProvider implements DocumentOcrProvider {
  readonly name = 'fake';
  calls = 0;
  async checkAvailability(): Promise<DocumentOcrAvailability> {
    return { available: true, languages: ['eng'], pdfSupported: true };
  }
  async recognize() {
    this.calls += 1;
    return {
      text: 'INVOICE 1001\nAmount: 1 234,56 EUR\nDate: 2026-07-28',
      pageCount: 1,
      language: 'eng',
      provider: this.name,
    };
  }
}

class EmptyOcrProvider extends FakeOcrProvider {
  override async recognize() {
    this.calls += 1;
    return {
      text: '',
      pageCount: 1,
      language: 'eng',
      provider: this.name,
    };
  }
}

function metadata(overrides: Partial<DocumentMetadata> = {}): DocumentMetadata {
  const now = new Date(0).toISOString();
  return {
    ...defaultDocumentIntelligenceMetadata(),
    id: 'document-1',
    companyId: 'company-a',
    uploadedBy: 'admin-a',
    status: 'PROCESSING',
    originalName: 'scan.png',
    storedName: 'document-1.png',
    mimeType: 'image/png',
    size: 8,
    checksum: 'a'.repeat(64),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    processingAttempts: 1,
    lastErrorCode: null,
    lastErrorMessage: null,
    processingStartedAt: now,
    processingCompletedAt: null,
    nextRetryAt: null,
    quarantinedAt: null,
    workerId: 'worker-a',
    pages: null,
    textLength: null,
    chunksCount: null,
    embeddingStatus: 'PENDING',
    embeddingModel: null,
    embeddingDimensions: null,
    embeddingVersion: null,
    embeddedAt: null,
    embeddingAttempts: 0,
    lastEmbeddingErrorCode: null,
    embeddingContentHash: null,
    ...overrides,
  };
}

function createPdf(text: string) {
  const escaped = text.replace(/([\\()])/g, '\\$1');
  const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

function intelligenceService(provider: FakeOcrProvider) {
  return new DefaultDocumentIntelligenceService({
    quality,
    typeDetector: new DefaultDocumentTypeDetector(0.8),
    ocr: new DefaultDocumentOcrService(provider, {
      driver: 'local',
      languages: ['eng'],
      timeoutMs: 1_000,
      maximumPages: 5,
      maximumFileSize: 1_000_000,
    }),
    version: 'test-v1',
  });
}

test('file detection uses signatures and exposes MIME spoofing', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const detected = detectDocumentFile({
    content: png,
    originalName: '../../invoice.pdf',
    declaredMimeType: 'application/pdf',
  });
  assert.equal(detected.format, 'PNG');
  assert.equal(detected.detectedMimeType, 'image/png');
  assert.equal(detected.mismatch, true);
  assert.equal(detected.processable, true);
});

test('unsupported office containers are detected but not processed', () => {
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual(
    detectDocumentFile({
      content: zip,
      originalName: 'report.xlsx',
      declaredMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }).processable,
    false,
  );
});

test('quality assessment rejects garbage even when it is long', () => {
  const result = quality.assess({ text: '#'.repeat(300), pageCount: 1 });
  assert.equal(result.sufficient, false);
  assert.equal(result.reason, 'REPEATED_GARBAGE');
  assert.equal(result.requiresOcr, true);
});

test('normalization preserves financial identifiers and page boundaries', () => {
  const normalized = normalizeDocumentText(
    'IBAN: LV80 BANK 0000 1234\r\nAmount: 1 234,56 EUR\0\n\n\n\n\f\nReg. No. 40001234567',
  );
  assert.match(normalized, /LV80 BANK 0000 1234/);
  assert.match(normalized, /1 234,56 EUR/);
  assert.match(normalized, /40001234567/);
  assert.doesNotMatch(normalized, /\0/);
  assert.match(normalized, /\f/);
});

test('PNG is OCRed once and low-confidence classification requires review', async () => {
  const provider = new FakeOcrProvider();
  const service = intelligenceService(provider);
  const result = await service.process(metadata(), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(provider.calls, 1);
  assert.equal(result.intelligence.textExtractionMethod, 'OCR');
  assert.equal(result.intelligence.ocrStatus, 'COMPLETED');
  assert.equal(result.intelligence.detectedDocumentType, 'INVOICE');
  assert.equal(result.intelligence.requiresManualReview, true);
  assert.equal(result.intelligence.extractedCharacterCount, result.text.length);
});

test('text PDF with sufficient quality does not invoke OCR', async () => {
  const provider = new FakeOcrProvider();
  const content = createPdf('INVOICE 1001 Amount 1234.56 Date 2026-07-28 Company Avantime');
  const result = await intelligenceService(provider).process(
    metadata({
      originalName: 'invoice.pdf',
      storedName: 'document-1.pdf',
      mimeType: 'application/pdf',
      size: content.length,
    }),
    content,
  );
  assert.equal(provider.calls, 0);
  assert.equal(result.intelligence.textExtractionMethod, 'PDF_TEXT');
  assert.equal(result.intelligence.ocrStatus, 'NOT_REQUIRED');
});

test('empty scanned PDF invokes OCR exactly once', async () => {
  const provider = new FakeOcrProvider();
  const content = createPdf('');
  const result = await intelligenceService(provider).process(
    metadata({
      originalName: 'scan.pdf',
      storedName: 'document-1.pdf',
      mimeType: 'application/pdf',
      size: content.length,
    }),
    content,
  );
  assert.equal(provider.calls, 1);
  assert.equal(result.intelligence.textExtractionMethod, 'OCR');
});

test('empty OCR result is never accepted as completed intelligence', async () => {
  const provider = new EmptyOcrProvider();
  await assert.rejects(
    intelligenceService(provider).process(
      metadata(),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      (error as Error & { code: string }).code === 'OCR_TEXT_QUALITY_INSUFFICIENT',
  );
  assert.equal(provider.calls, 1);
});

test('UNKNOWN remains allowed and is sent to manual review', () => {
  const detected = new DefaultDocumentTypeDetector(0.7).detect({
    text: 'Generic content without a deterministic marker.',
    detectedMimeType: 'application/pdf',
  });
  assert.equal(detected.documentType, 'UNKNOWN');
  assert.equal(detected.requiresManualReview, true);
});

test('OCR language values cannot inject command arguments', async () => {
  const provider = new TesseractDocumentOcrProvider();
  await assert.rejects(
    provider.recognize({
      content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      mimeType: 'image/png',
      languages: ['eng;touch /tmp/unsafe'],
      maximumPages: 1,
      maximumFileSize: 100,
      timeoutMs: 100,
    }),
    /unsupported language/,
  );
});

test('local OCR adapter disables shell execution and cleans temporary files in finally', async () => {
  const source = await readFile(path.join(process.cwd(), 'lib/document-ocr.ts'), 'utf8');
  assert.match(source, /shell: false/);
  assert.match(source, /finally\s*\{[\s\S]*rm\(directory,\s*\{\s*recursive: true,\s*force: true/);
  assert.doesNotMatch(
    source,
    /import\s*\{[^}]*\bexec(?:Sync)?\b[^}]*\}\s*from 'node:child_process'/,
  );
});
