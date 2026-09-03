import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import { DefaultDocumentIntelligenceService } from '../../lib/document-intelligence';
import { defaultDocumentIntelligenceMetadata } from '../../lib/document-intelligence-model';
import {
  DefaultDocumentOcrService,
  TesseractDocumentOcrProvider,
  type DocumentOcrProvider,
  type DocumentOcrRequest,
} from '../../lib/document-ocr';
import { DefaultDocumentTextQualityService } from '../../lib/document-text-quality';
import { DefaultDocumentTypeDetector } from '../../lib/document-type-detection';
import type { DocumentMetadata } from '../../lib/document-model';

const GLYPHS: Record<string, readonly string[]> = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
};

function crc32(content: Buffer) {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createSyntheticTextImage(text: string) {
  const scale = 10;
  const margin = 20;
  const glyphWidth = 5;
  const glyphHeight = 7;
  const spacing = 1;
  const width = margin * 2 + (text.length * (glyphWidth + spacing) - spacing) * scale;
  const height = margin * 2 + glyphHeight * scale;
  const pixels = Buffer.alloc(width * height, 255);

  for (const [characterIndex, character] of [...text].entries()) {
    const glyph = GLYPHS[character];
    if (!glyph) throw new Error(`Missing synthetic OCR glyph: ${character}`);
    for (const [row, pattern] of glyph.entries()) {
      for (const [column, value] of [...pattern].entries()) {
        if (value !== '1') continue;
        const originX = margin + (characterIndex * (glyphWidth + spacing) + column) * scale;
        const originY = margin + row * scale;
        for (let y = 0; y < scale; y += 1) {
          pixels.fill(0, (originY + y) * width + originX, (originY + y) * width + originX + scale);
        }
      }
    }
  }

  const scanlines = Buffer.alloc((width + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const offset = row * (width + 1);
    scanlines[offset] = 0;
    pixels.copy(scanlines, offset + 1, row * width, (row + 1) * width);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 0;

  return {
    width,
    height,
    pixels,
    png: Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk('IHDR', header),
      pngChunk('IDAT', deflateSync(scanlines)),
      pngChunk('IEND'),
    ]),
  };
}

function createPdf(objects: readonly Buffer[]) {
  const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'binary')];
  const offsets = [0];
  let length = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const wrapped = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'ascii'),
      object,
      Buffer.from('\nendobj\n', 'ascii'),
    ]);
    parts.push(wrapped);
    length += wrapped.length;
  });
  const xrefOffset = length;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`,
    `startxref\n${xrefOffset}\n%%EOF\n`,
  ].join('');
  parts.push(Buffer.from(xref, 'ascii'));
  return Buffer.concat(parts);
}

function createScannedPdf(text: string) {
  const image = createSyntheticTextImage(text);
  const compressed = deflateSync(image.pixels);
  const pageWidth = (image.width * 72) / 150;
  const pageHeight = (image.height * 72) / 150;
  const paint = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im1 Do Q`;
  return createPdf([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`,
    ),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
      ),
      compressed,
      Buffer.from('\nendstream'),
    ]),
    Buffer.from(`<< /Length ${Buffer.byteLength(paint)} >>\nstream\n${paint}\nendstream`),
  ]);
}

function createTextPdf(text: string) {
  const escaped = text.replace(/([\\()])/gu, '\\$1');
  const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`;
  return createPdf([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    ),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    Buffer.from(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`),
  ]);
}

function ocrService(provider: DocumentOcrProvider, timeoutMs = 30_000) {
  return new DefaultDocumentOcrService(provider, {
    driver: 'local',
    languages: ['eng'],
    timeoutMs,
    maximumPages: 2,
    maximumFileSize: 2_000_000,
  });
}

function metadata(content: Buffer): DocumentMetadata {
  const now = new Date(0).toISOString();
  return {
    ...defaultDocumentIntelligenceMetadata(),
    id: 'ocr-integration-document',
    companyId: 'ocr-integration-company',
    uploadedBy: 'ocr-integration-user',
    status: 'PROCESSING',
    originalName: 'document.pdf',
    storedName: 'ocr-integration-document.pdf',
    mimeType: 'application/pdf',
    size: content.length,
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
    workerId: 'ocr-integration-worker',
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
  };
}

class CountingOcrProvider implements DocumentOcrProvider {
  readonly name: string;
  calls = 0;

  constructor(private readonly delegate: DocumentOcrProvider) {
    this.name = delegate.name;
  }

  checkAvailability(languages: readonly string[]) {
    return this.delegate.checkAvailability(languages);
  }

  recognize(request: DocumentOcrRequest) {
    this.calls += 1;
    return this.delegate.recognize(request);
  }
}

async function temporaryOcrDirectories() {
  return new Set((await readdir(tmpdir())).filter((name) => name.startsWith('avantime-ocr-')));
}

async function assertTemporaryFilesCleaned(action: () => Promise<unknown>) {
  const before = await temporaryOcrDirectories();
  try {
    await action();
  } finally {
    assert.deepEqual(await temporaryOcrDirectories(), before);
  }
}

test(
  'local Tesseract OCR processes a synthetic PNG when explicitly enabled',
  { skip: process.env.RUN_DOCUMENT_OCR_INTEGRATION_TESTS !== '1' },
  async () => {
    const provider = new TesseractDocumentOcrProvider();
    const availability = await provider.checkAvailability(['eng']);
    assert.equal(availability.available, true, 'Tesseract and eng language data are required.');
    await assertTemporaryFilesCleaned(async () => {
      const result = await ocrService(provider).recognize({
        content: createSyntheticTextImage('AVANTIME OCR').png,
        mimeType: 'image/png',
      });
      assert.equal(result.pageCount, 1);
      assert.equal(result.provider, 'tesseract');
      assert.match(result.text, /OCR/i);
    });
  },
);

test(
  'local OCR renders a scanned PDF through Poppler and recognizes it with Tesseract',
  { skip: process.env.RUN_DOCUMENT_OCR_INTEGRATION_TESTS !== '1' },
  async () => {
    await assertTemporaryFilesCleaned(async () => {
      const result = await ocrService(new TesseractDocumentOcrProvider()).recognize({
        content: createScannedPdf('AVANTIME OCR'),
        mimeType: 'application/pdf',
      });
      assert.equal(result.pageCount, 1);
      assert.match(result.text, /OCR/i);
    });
  },
);

test(
  'text-layer PDF is extracted without invoking OCR in the container runtime',
  { skip: process.env.RUN_DOCUMENT_OCR_INTEGRATION_TESTS !== '1' },
  async () => {
    const content = createTextPdf('INVOICE 1001 Amount 1234.56 Date 2026-09-03 Avantime');
    const provider = new CountingOcrProvider(new TesseractDocumentOcrProvider());
    const service = new DefaultDocumentIntelligenceService({
      quality: new DefaultDocumentTextQualityService({
        minimumCharacters: 20,
        minimumPrintableRatio: 0.9,
        minimumAlphanumericRatio: 0.2,
      }),
      typeDetector: new DefaultDocumentTypeDetector(0.8),
      ocr: ocrService(provider),
      version: 'ocr-integration-v1',
    });
    const result = await service.process(metadata(content), content);
    assert.equal(provider.calls, 0);
    assert.equal(result.intelligence.textExtractionMethod, 'PDF_TEXT');
    assert.equal(result.intelligence.ocrStatus, 'NOT_REQUIRED');
  },
);

test(
  'corrupt PDF fails with a controlled code and cleans temporary files',
  { skip: process.env.RUN_DOCUMENT_OCR_INTEGRATION_TESTS !== '1' },
  async () => {
    await assertTemporaryFilesCleaned(async () => {
      await assert.rejects(
        ocrService(new TesseractDocumentOcrProvider()).recognize({
          content: Buffer.from('%PDF-1.4\ncorrupt', 'ascii'),
          mimeType: 'application/pdf',
        }),
        (error: unknown) =>
          error instanceof Error &&
          'code' in error &&
          (error as Error & { code: string }).code === 'OCR_EXECUTION_FAILED',
      );
    });
  },
);

test(
  'OCR timeout fails with a controlled code and cleans temporary files',
  { skip: process.env.RUN_DOCUMENT_OCR_INTEGRATION_TESTS !== '1' },
  async () => {
    await assertTemporaryFilesCleaned(async () => {
      await assert.rejects(
        ocrService(new TesseractDocumentOcrProvider(), 1).recognize({
          content: createSyntheticTextImage('AVANTIME OCR').png,
          mimeType: 'image/png',
        }),
        (error: unknown) =>
          error instanceof Error &&
          'code' in error &&
          (error as Error & { code: string }).code === 'OCR_TIMEOUT',
      );
    });
  },
);
