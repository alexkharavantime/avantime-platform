import path from 'node:path';

export type DetectedDocumentFormat = 'PDF' | 'PNG' | 'JPEG' | 'WORD' | 'EXCEL' | 'UNKNOWN';

export type DocumentFileDetectionInput = {
  content: Buffer;
  originalName: string;
  declaredMimeType?: string | null;
};

export type DocumentFileDetectionResult = {
  format: DetectedDocumentFormat;
  detectedMimeType: string;
  processable: boolean;
  mismatch: boolean;
};

const MIME_BY_FORMAT: Record<DetectedDocumentFormat, string> = {
  PDF: 'application/pdf',
  PNG: 'image/png',
  JPEG: 'image/jpeg',
  WORD: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  UNKNOWN: 'application/octet-stream',
};

function signatureFormat(content: Buffer): DetectedDocumentFormat {
  if (content.subarray(0, 5).toString('ascii') === '%PDF-') return 'PDF';
  if (content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'PNG';
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return 'JPEG';
  }
  return 'UNKNOWN';
}

function containerFormat(originalName: string, content: Buffer): DetectedDocumentFormat {
  const extension = path.extname(originalName).toLowerCase();
  const zip = content.length >= 4 && content[0] === 0x50 && content[1] === 0x4b;
  if (!zip) return 'UNKNOWN';
  if (extension === '.docx') return 'WORD';
  if (extension === '.xlsx') return 'EXCEL';
  return 'UNKNOWN';
}

export function detectDocumentFile(input: DocumentFileDetectionInput): DocumentFileDetectionResult {
  const format =
    signatureFormat(input.content) === 'UNKNOWN'
      ? containerFormat(input.originalName, input.content)
      : signatureFormat(input.content);
  const detectedMimeType = MIME_BY_FORMAT[format];
  const declared = input.declaredMimeType?.trim().toLowerCase();

  return {
    format,
    detectedMimeType,
    processable: format === 'PDF' || format === 'PNG' || format === 'JPEG',
    mismatch: Boolean(
      declared && declared !== 'application/octet-stream' && declared !== detectedMimeType,
    ),
  };
}
