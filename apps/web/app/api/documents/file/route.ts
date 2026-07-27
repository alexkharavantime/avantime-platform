import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { authorizeDocumentApi } from '../../../../lib/document-authorization';

type DocumentItem = {
  id: string;
  name: string;
  storedName: string;
  type: string;
  size: number;
  status: string;
  uploadedAt: string;
};

const dataDirectory = path.join(process.cwd(), '.data');
const uploadDirectory = path.join(dataDirectory, 'uploads', 'documents');
const documentsFile = path.join(dataDirectory, 'documents.json');

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
    const authorization = await authorizeDocumentApi();
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

    const filePath = path.join(
      uploadDirectory,
      document.storedName,
    );

    const file = await readFile(filePath);

    return new NextResponse(file, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(
          document.name,
        )}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Document file error:', error);

    return NextResponse.json(
      { error: 'Не удалось открыть документ.' },
      { status: 500 },
    );
  }
}
