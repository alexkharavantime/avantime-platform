import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { authorizeDocumentApi } from '../../../../lib/document-authorization';

export const runtime = 'nodejs';

type DocumentItem = {
  id: string;
  name: string;
  status: string;
  chunksFile?: string;
};

type TextChunk = {
  id: string;
  index: number;
  text: string;
  start: number;
  end: number;
};

type SearchResult = {
  documentId: string;
  documentName: string;
  chunkId: string;
  chunkIndex: number;
  snippet: string;
  matches: number;
  score: number;
};

const dataDirectory = path.join(process.cwd(), '.data');
const documentsFile = path.join(dataDirectory, 'documents.json');
const chunksDirectory = path.join(dataDirectory, 'chunks');

async function readDocuments(): Promise<DocumentItem[]> {
  try {
    const content = await readFile(documentsFile, 'utf-8');
    const parsed: unknown = JSON.parse(content);

    return Array.isArray(parsed)
      ? (parsed as DocumentItem[])
      : [];
  } catch {
    return [];
  }
}

async function readChunks(
  chunksFile: string,
): Promise<TextChunk[]> {
  try {
    const content = await readFile(
      path.join(chunksDirectory, chunksFile),
      'utf-8',
    );

    const parsed: unknown = JSON.parse(content);

    return Array.isArray(parsed)
      ? (parsed as TextChunk[])
      : [];
  } catch {
    return [];
  }
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string) {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length >= 2);
}

function countOccurrences(
  source: string,
  query: string,
) {
  if (!query) {
    return 0;
  }

  let count = 0;
  let position = 0;

  while (true) {
    const index = source.indexOf(query, position);

    if (index === -1) {
      break;
    }

    count += 1;
    position = index + query.length;
  }

  return count;
}

function calculateScore(
  chunkText: string,
  query: string,
) {
  const normalizedText = normalize(chunkText);
  const normalizedQuery = normalize(query);
  const queryTokens = tokenize(query);

  const exactMatches = countOccurrences(
    normalizedText,
    normalizedQuery,
  );

  let tokenMatches = 0;

  for (const token of queryTokens) {
    tokenMatches += countOccurrences(
      normalizedText,
      token,
    );
  }

  const matchedUniqueTokens = queryTokens.filter(
    (token) => normalizedText.includes(token),
  ).length;

  const coverage =
    queryTokens.length > 0
      ? matchedUniqueTokens / queryTokens.length
      : 0;

  return {
    matches: exactMatches + tokenMatches,
    score:
      exactMatches * 10 +
      tokenMatches * 2 +
      coverage * 5,
  };
}

function createSnippet(
  text: string,
  query: string,
) {
  const normalizedText = text.toLocaleLowerCase('ru-RU');
  const normalizedQuery = query.toLocaleLowerCase('ru-RU');

  let matchIndex = normalizedText.indexOf(
    normalizedQuery,
  );

  if (matchIndex === -1) {
    const firstToken = tokenize(query)[0];

    matchIndex = firstToken
      ? normalizedText.indexOf(firstToken)
      : 0;
  }

  if (matchIndex === -1) {
    matchIndex = 0;
  }

  const radius = 220;
  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(
    text.length,
    matchIndex + query.length + radius,
  );

  let snippet = text
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .trim();

  if (start > 0) {
    snippet = `…${snippet}`;
  }

  if (end < text.length) {
    snippet = `${snippet}…`;
  }

  return snippet;
}

export async function GET(request: Request) {
  try {
    const authorization = await authorizeDocumentApi();
    if (authorization.response) return authorization.response;

    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.trim() ?? '';

    if (query.length < 2) {
      return NextResponse.json(
        {
          error: 'Введите не менее двух символов.',
        },
        {
          status: 400,
        },
      );
    }

    const documents = await readDocuments();
    const results: SearchResult[] = [];

    for (const document of documents) {
      if (
        document.status !== 'Обработан' ||
        !document.chunksFile
      ) {
        continue;
      }

      const chunks = await readChunks(
        document.chunksFile,
      );

      for (const chunk of chunks) {
        const evaluation = calculateScore(
          chunk.text,
          query,
        );

        if (evaluation.score <= 0) {
          continue;
        }

        results.push({
          documentId: document.id,
          documentName: document.name,
          chunkId: chunk.id,
          chunkIndex: chunk.index,
          snippet: createSnippet(
            chunk.text,
            query,
          ),
          matches: evaluation.matches,
          score: Number(
            evaluation.score.toFixed(2),
          ),
        });
      }
    }

 results.sort(
  (first, second) =>
    second.score - first.score,
);

const bestByDocument = new Map<
  string,
  SearchResult & {
    chunksFound: number;
  }
>();

for (const result of results) {
  const existing = bestByDocument.get(
    result.documentId,
  );

  if (!existing) {
    bestByDocument.set(result.documentId, {
      ...result,
      chunksFound: 1,
    });

    continue;
  }

  existing.chunksFound += 1;

  if (result.score > existing.score) {
    bestByDocument.set(result.documentId, {
      ...result,
      chunksFound: existing.chunksFound,
    });
  }
}

const groupedResults = Array.from(
  bestByDocument.values(),
)
  .sort(
    (first, second) =>
      second.score - first.score,
  )
  .slice(0, 20);

return NextResponse.json({
  query,
  total: groupedResults.length,
  results: groupedResults,
});
  } catch (error) {
    console.error('Chunk search error:', error);

    return NextResponse.json(
      {
        error: 'Не удалось выполнить поиск.',
      },
      {
        status: 500,
      },
    );
  }
}
