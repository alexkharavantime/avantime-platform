import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { authorizeApi } from '../../../../lib/authorization';

type DocumentItem = {
  id: string;
  name: string;
  textFile?: string;
};

const dataDirectory = path.join(process.cwd(), '.data');

const documentsFile = path.join(
  dataDirectory,
  'documents.json',
);

const textDirectory = path.join(
  dataDirectory,
  'text',
);

async function readDocuments(): Promise<DocumentItem[]> {
  try {
    const content = await readFile(documentsFile, 'utf-8');
    const documents = JSON.parse(content);

    return Array.isArray(documents) ? documents : [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  try {
    const authorization = await authorizeApi(['ADMIN']);
    if (authorization.response) return authorization.response;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Не указан документ.' },
        { status: 400 },
      );
    }

    const documents = await readDocuments();
    const document = documents.find((item) => item.id === id);

    if (!document) {
      return NextResponse.json(
        { error: 'Документ не найден.' },
        { status: 404 },
      );
    }

    if (!document.textFile) {
      return NextResponse.json(
        { error: 'Текст документа ещё не извлечён.' },
        { status: 404 },
      );
    }

    const text = await readFile(
      path.join(textDirectory, document.textFile),
      'utf-8',
    );

    return NextResponse.json({ text });
  } catch (error) {
    console.error('Document text error:', error);

    return NextResponse.json(
      { error: 'Не удалось получить текст документа.' },
      { status: 500 },
    );
  }
}
