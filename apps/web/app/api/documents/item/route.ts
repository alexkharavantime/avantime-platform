import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { authorizeApi } from '../../../../lib/authorization';

type DocumentItem = {
  id: string;
  name: string;
  storedName: string;
  type: string;
  size: number;
  status: string;
  uploadedAt: string;
};

const documentsFile = path.join(
  process.cwd(),
  '.data',
  'documents.json',
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

  return NextResponse.json({ document });
}
