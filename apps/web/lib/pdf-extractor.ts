import { PDFParse } from 'pdf-parse';

import type { TextChunk } from './document-model';

type ExtractPdfResult = {
  text: string;
  pages: number;
  pageTexts?: string[];
  chunks: TextChunk[];
  chunksCount: number;
};

export function splitTextIntoChunks(
  sourceText: string,
  chunkSize = 1200,
  overlap = 200,
): TextChunk[] {
  const text = sourceText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      const sentenceBreak = text.lastIndexOf('. ', end);

      const preferredBreak = Math.max(paragraphBreak, sentenceBreak);

      if (preferredBreak > start + Math.floor(chunkSize * 0.6)) {
        end = preferredBreak + 1;
      }
    }

    const chunkText = text.slice(start, end).trim();

    if (chunkText) {
      chunks.push({
        id: `${index}`,
        index,
        text: chunkText,
        start,
        end,
        pageStart: null,
        pageEnd: null,
        sourceSegmentIndex: index,
        extractionMethod: 'UNKNOWN',
        sourceCoordinates: null,
        provenanceConfidence: null,
        provenanceVersion: 'page-provenance-v1',
      });

      index += 1;
    }

    if (end >= text.length) {
      break;
    }

    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

export function splitPagesIntoChunks(
  pageTexts: readonly string[],
  extractionMethod: 'PDF_TEXT' | 'OCR',
): { text: string; chunks: TextChunk[] } {
  const normalizedPages = pageTexts.map((page) =>
    page
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
  const text = normalizedPages.join('\n\n');
  const chunks: TextChunk[] = [];
  let offset = 0;
  for (let pageIndex = 0; pageIndex < normalizedPages.length; pageIndex += 1) {
    const pageText = normalizedPages[pageIndex];
    for (const pageChunk of splitTextIntoChunks(pageText)) {
      const index = chunks.length;
      chunks.push({
        ...pageChunk,
        id: String(index),
        index,
        start: pageChunk.start + offset,
        end: pageChunk.end + offset,
        pageStart: pageIndex + 1,
        pageEnd: pageIndex + 1,
        sourceSegmentIndex: pageChunk.index,
        extractionMethod,
        sourceCoordinates: null,
        provenanceConfidence: extractionMethod === 'PDF_TEXT' ? 1 : 0.8,
        provenanceVersion: 'page-provenance-v1',
      });
    }
    offset += pageText.length + (pageIndex < normalizedPages.length - 1 ? 2 : 0);
  }
  return { text, chunks };
}

export async function extractPdfText(pdfBuffer: Buffer): Promise<ExtractPdfResult> {
  const parser = new PDFParse({
    data: pdfBuffer,
  });

  try {
    const result = await parser.getText();
    const pageTexts = result.pages.map((page) => page.text);
    const paged = splitPagesIntoChunks(pageTexts, 'PDF_TEXT');
    const text = paged.text;
    const chunks = paged.chunks;

    return {
      text,
      pages: result.total ?? 0,
      pageTexts,
      chunks,
      chunksCount: chunks.length,
    };
  } finally {
    await parser.destroy();
  }
}
