import {
  mkdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises';

import path from 'node:path';
import { NextResponse } from 'next/server';
import { extractPdfText } from '../../../../lib/pdf-extractor';
import { authorizeApi } from '../../../../lib/authorization';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

type DocumentItem = {
  id: string;
  name: string;
  storedName: string;
  type: string;
  size: number;
  status: string;
  uploadedAt: string;

  textFile?: string;
  pages?: number;
  textLength?: number;
  processedAt?: string;
  errorMessage?: string;

  chunksFile?: string;
  chunksCount?: number;
};

const dataDirectory = path.join(
  process.cwd(),
  '.data',
);

const uploadDirectory = path.join(
  dataDirectory,
  'uploads',
  'documents',
);

const textDirectory = path.join(
  dataDirectory,
  'text',
);

const chunksDirectory = path.join(
  dataDirectory,
  'chunks',
);

const documentsFile = path.join(
  dataDirectory,
  'documents.json',
);

async function readDocuments(): Promise<DocumentItem[]> {
  try {
    const content = await readFile(
      documentsFile,
      'utf-8',
    );

    const parsed: unknown = JSON.parse(content);

    return Array.isArray(parsed)
      ? (parsed as DocumentItem[])
      : [];
  } catch {
    return [];
  }
}

async function saveDocuments(
  documents: DocumentItem[],
) {
  await mkdir(dataDirectory, {
    recursive: true,
  });

  await writeFile(
    documentsFile,
    JSON.stringify(documents, null, 2),
    'utf-8',
  );
}

export async function GET() {
  try {
    const authorization = await authorizeApi(['ADMIN']);
    if (authorization.response) return authorization.response;

    const documents = await readDocuments();

    return NextResponse.json({
      documents,
    });
  } catch (error) {
    console.error(
      'Document list error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Не удалось получить список документов.',
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeApi(['ADMIN']);
    if (authorization.response) return authorization.response;

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: 'Файл не выбран.',
        },
        {
          status: 400,
        },
      );
    }

    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      return NextResponse.json(
        {
          error:
            'Сейчас поддерживаются только PDF-файлы.',
        },
        {
          status: 400,
        },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error:
            'Размер файла не должен превышать 20 МБ.',
        },
        {
          status: 400,
        },
      );
    }

    await mkdir(uploadDirectory, {
      recursive: true,
    });

    const id = crypto.randomUUID();

    const safeName = file.name
      .replace(
        /[^a-zA-Z0-9а-яА-ЯёЁ._-]/g,
        '_',
      )
      .replace(/_+/g, '_');

    const storedName = `${id}-${safeName}`;

    const filePath = path.join(
      uploadDirectory,
      storedName,
    );

    const bytes = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(bytes);

    await writeFile(filePath, pdfBuffer);

    const document: DocumentItem = {
      id,
      name: file.name,
      storedName,
      type: 'PDF',
      size: file.size,
      status: 'Обрабатывается',
      uploadedAt: new Date().toISOString(),
    };

    const documents = await readDocuments();

    documents.unshift(document);

    // Сначала сохраняем факт загрузки.
    await saveDocuments(documents);

    try {
      const extracted = await extractPdfText(
        pdfBuffer,
        id,
      );

      document.status = 'Обработан';
      document.textFile = extracted.textFile;
      document.pages = extracted.pages;
      document.textLength =
        extracted.text.length;
      document.chunksFile =
        extracted.chunksFile;
      document.chunksCount =
        extracted.chunksCount;
      document.processedAt =
        new Date().toISOString();

      delete document.errorMessage;
    } catch (processingError) {
      console.error(
        'PDF processing error:',
        processingError,
      );

      document.status = 'Ошибка';

      document.errorMessage =
        processingError instanceof Error
          ? processingError.message
          : 'Не удалось извлечь текст.';
    }

    // Обязательно повторно сохраняем уже итоговый статус.
    await saveDocuments(documents);

    return NextResponse.json({
      document,
    });
  } catch (error) {
    console.error(
      'Document upload error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Не удалось загрузить документ.',
      },
      {
        status: 500,
      },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authorization = await authorizeApi(['ADMIN']);
    if (authorization.response) return authorization.response;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          error:
            'Не указан идентификатор документа.',
        },
        {
          status: 400,
        },
      );
    }

    const documents = await readDocuments();

    const document = documents.find(
      (item) => item.id === id,
    );

    if (!document) {
      return NextResponse.json(
        {
          error: 'Документ не найден.',
        },
        {
          status: 404,
        },
      );
    }

    const filesToDelete = [
      path.join(
        uploadDirectory,
        document.storedName,
      ),

      document.textFile
        ? path.join(
            textDirectory,
            document.textFile,
          )
        : null,

      document.chunksFile
        ? path.join(
            chunksDirectory,
            document.chunksFile,
          )
        : null,
    ].filter(
      (filePath): filePath is string =>
        Boolean(filePath),
    );

    for (const filePath of filesToDelete) {
      try {
        await unlink(filePath);
      } catch {
        // Файл уже мог отсутствовать.
      }
    }

    const updatedDocuments =
      documents.filter(
        (item) => item.id !== id,
      );

    await saveDocuments(updatedDocuments);

    return NextResponse.json({
      success: true,
      id,
    });
  } catch (error) {
    console.error(
      'Document delete error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Не удалось удалить документ.',
      },
      {
        status: 500,
      },
    );
  }
}
