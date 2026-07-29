import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import { getRepositoryRoot } from './document-integration-environment';

function createPdf(text: string) {
  const ascii = text.normalize('NFKD').replace(/[^\x20-\x7e]/g, '?');
  const escaped = ascii.replace(/([\\()])/g, '\\$1');
  const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    ),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    Buffer.from(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`),
  ];
  return assemblePdf(objects);
}

function assemblePdf(objects: Buffer[]) {
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  let length = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const entry = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      object,
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(entry);
    length += entry.length;
  });
  const xrefOffset = length;
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    trailer += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(Buffer.from(trailer));
  return Buffer.concat(parts);
}

function createScannedPdf() {
  const width = 8;
  const height = 8;
  const pixels = Buffer.from(
    Array.from({ length: width * height }, (_, index) =>
      (Math.floor(index / width) + index) % 3 === 0 ? 0 : 255,
    ),
  );
  const compressed = deflateSync(pixels);
  const image = Buffer.concat([
    Buffer.from(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
    ),
    compressed,
    Buffer.from('\nendstream'),
  ]);
  const content = 'q 360 0 0 180 72 540 cm /Im1 Do Q';
  return assemblePdf([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>',
    ),
    image,
    Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
  ]);
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

function createSyntheticPng() {
  const width = 128;
  const height = 48;
  const pixels = Buffer.alloc(width * height, 255);
  for (let y = 10; y < 38; y += 1) {
    for (let x = 10; x < 118; x += 1) {
      if ((x + y) % 7 < 3) pixels[y * width + x] = 0;
    }
  }
  const scanlines = Buffer.alloc((width + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const offset = row * (width + 1);
    pixels.copy(scanlines, offset + 1, row * width, (row + 1) * width);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND'),
  ]);
}

function checksum(content: Buffer) {
  return createHash('sha256').update(content).digest('hex');
}

async function main() {
  const repositoryRoot = getRepositoryRoot();
  const sourceManifest = path.join(repositoryRoot, 'apps', 'web', 'staging-data', 'manifest.json');
  const outputDirectory = path.join(repositoryRoot, '.artifacts', 'staging-data');
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const files: Record<string, Buffer> = {
    'text-layer-en.pdf': createPdf(
      'Synthetic English invoice page one. Page provenance marker EN-001.',
    ),
    'text-layer-lv.pdf': createPdf(
      'Sintetisks latviesu rekina paraugs. Lapas izcelsmes markieris LV-001.',
    ),
    'text-layer-ru.pdf': createPdf(
      'Sinteticheskiy russkiy dokument. Marker proiskhozhdeniya stranitsy RU-001.',
    ),
    'scanned-en.pdf': createScannedPdf(),
    'ocr-en.png': createSyntheticPng(),
    'neutral-image.jpg': Buffer.from(
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EF//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EF//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EF//2Q==',
      'base64',
    ),
  };
  const generated = [];
  for (const [filename, content] of Object.entries(files)) {
    await writeFile(path.join(outputDirectory, filename), content, { mode: 0o600 });
    generated.push({ filename, bytes: content.length, sha256: checksum(content) });
  }
  const manifest = JSON.parse(await readFile(sourceManifest, 'utf8')) as Record<string, unknown>;
  const result = {
    ...manifest,
    generatedAt: new Date().toISOString(),
    generated,
  };
  await writeFile(
    path.join(outputDirectory, 'manifest.generated.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      status: 'completed',
      outputDirectory: path.relative(repositoryRoot, outputDirectory),
      files: generated.length,
      classification: 'synthetic-only',
    }),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      errorCode: 'STAGING_DATASET_GENERATION_FAILED',
      message: error instanceof Error ? error.message : 'Dataset generation failed.',
    }),
  );
  process.exitCode = 1;
});
