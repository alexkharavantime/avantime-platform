import { PDFParse } from 'pdf-parse';

import type { TextChunk } from './document-model';

type ExtractPdfResult = {
  text: string;
  pages: number;
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

export async function extractPdfText(pdfBuffer: Buffer): Promise<ExtractPdfResult> {
  const parser = new PDFParse({
    data: pdfBuffer,
  });

  try {
    const result = await parser.getText();
    const text = result.text?.trim() ?? '';

    const chunks = splitTextIntoChunks(text);

    return {
      text,
      pages: result.total ?? 0,
      chunks,
      chunksCount: chunks.length,
    };
  } finally {
    await parser.destroy();
  }
}
