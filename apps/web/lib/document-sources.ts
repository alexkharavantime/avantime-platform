import { readFile } from 'node:fs/promises';
import path from 'node:path';

type DocumentItem = {
  id: string;
  name: string;
  status: string;
  chunksFile?: string;
};

type TextChunk = {
  id: string;
  text: string;
};

export type DocumentSourceReference = {
  documentId?: unknown;
  chunkId?: unknown;
};

export type ResolvedDocumentSource = {
  documentId: string;
  documentName: string;
  chunkId: string;
  snippet: string;
};

const dataDirectory = path.join(process.cwd(), '.data');
const documentsFile = path.join(dataDirectory, 'documents.json');
const chunksDirectory = path.join(dataDirectory, 'chunks');

async function readJsonArray<T>(filePath: string): Promise<T[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export async function resolveDocumentSources(
  references: DocumentSourceReference[],
): Promise<ResolvedDocumentSource[]> {
  const documents = await readJsonArray<DocumentItem>(documentsFile);
  const resolved: ResolvedDocumentSource[] = [];
  const seen = new Set<string>();

  for (const reference of references.slice(0, 6)) {
    if (
      typeof reference.documentId !== 'string' ||
      typeof reference.chunkId !== 'string' ||
      reference.documentId.length > 128 ||
      reference.chunkId.length > 128
    ) {
      continue;
    }

    const key = `${reference.documentId}:${reference.chunkId}`;
    if (seen.has(key)) continue;

    const document = documents.find(
      (item) =>
        item.id === reference.documentId &&
        item.status === 'Обработан' &&
        item.chunksFile,
    );
    if (!document?.chunksFile) continue;

    const chunksFile = path.basename(document.chunksFile);
    const chunks = await readJsonArray<TextChunk>(path.join(chunksDirectory, chunksFile));
    const chunk = chunks.find(
      (item) => item.id === reference.chunkId && typeof item.text === 'string',
    );
    if (!chunk) continue;

    seen.add(key);
    resolved.push({
      documentId: document.id,
      documentName: document.name,
      chunkId: chunk.id,
      snippet: chunk.text.slice(0, 4_000),
    });
  }

  return resolved;
}
