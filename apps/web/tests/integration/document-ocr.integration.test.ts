import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { deflateSync } from 'node:zlib';

import { DefaultDocumentOcrService, TesseractDocumentOcrProvider } from '../../lib/document-ocr';

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
const executeFile = promisify(execFile);

function assertRecognizedFixture(text: string) {
  assert.match(text.replace(/\s/g, ''), /TIME/i);
}

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

function createSyntheticTextRaster(text: string) {
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

  return { width, height, pixels };
}

function createSyntheticTextPng(text: string) {
  const { width, height, pixels } = createSyntheticTextRaster(text);
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

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND'),
  ]);
}

function createPdf(text: string) {
  const { width, height, pixels } = createSyntheticTextRaster(text);
  const image = deflateSync(pixels);
  const renderedHeight = Math.round((468 * height) / width);
  const stream = [650, 520, 390, 260]
    .map((y) => `q 468 0 0 ${renderedHeight} 72 ${y} cm /Im0 Do Q`)
    .join('\n');
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'ascii'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
      'ascii',
    ),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`,
        'ascii',
      ),
      image,
      Buffer.from('\nendstream', 'ascii'),
    ]),
    Buffer.from(
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
      'ascii',
    ),
  ];
  let pdf = Buffer.from('%PDF-1.4\n', 'ascii');
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf = Buffer.concat([
      pdf,
      Buffer.from(`${index + 1} 0 obj\n`, 'ascii'),
      object,
      Buffer.from('\nendobj\n', 'ascii'),
    ]);
  });
  const xrefOffset = pdf.length;
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    trailer += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.concat([pdf, Buffer.from(trailer, 'ascii')]);
}

async function renderPdfAsJpeg(pdf: Buffer) {
  const directory = await mkdtemp(path.join(tmpdir(), 'avantime-ocr-jpeg-'));
  try {
    const pdfPath = path.join(directory, 'input.pdf');
    const outputPrefix = path.join(directory, 'output');
    await writeFile(pdfPath, pdf, { flag: 'wx', mode: 0o600 });
    await executeFile('pdftoppm', [
      '-jpeg',
      '-jpegopt',
      'quality=95',
      '-r',
      '200',
      '-singlefile',
      pdfPath,
      outputPrefix,
    ]);
    return await readFile(`${outputPrefix}.jpg`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test(
  'local Tesseract OCR processes supported PDF, PNG and JPEG content when explicitly enabled',
  { skip: process.env.RUN_DOCUMENT_OCR_INTEGRATION_TESTS !== '1' },
  async () => {
    const provider = new TesseractDocumentOcrProvider();
    const availability = await provider.checkAvailability(['eng']);
    assert.equal(availability.available, true, 'Tesseract and eng language data are required.');
    const service = new DefaultDocumentOcrService(provider, {
      driver: 'local',
      languages: ['eng'],
      timeoutMs: 30_000,
      maximumPages: 1,
      maximumFileSize: 1_000_000,
    });
    const pngResult = await service.recognize({
      content: createSyntheticTextPng('AVANTIME OCR'),
      mimeType: 'image/png',
    });
    assert.equal(pngResult.pageCount, 1);
    assert.equal(pngResult.provider, 'tesseract');
    assertRecognizedFixture(pngResult.text);

    const pdf = createPdf('AVANTIME OCR');
    const pdfResult = await service.recognize({
      content: pdf,
      mimeType: 'application/pdf',
    });
    assert.equal(pdfResult.pageCount, 1);
    assertRecognizedFixture(pdfResult.text);

    const jpegResult = await service.recognize({
      content: await renderPdfAsJpeg(pdf),
      mimeType: 'image/jpeg',
    });
    assert.equal(jpegResult.pageCount, 1);
    assertRecognizedFixture(jpegResult.text);
  },
);
