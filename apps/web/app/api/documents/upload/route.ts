import { NextResponse } from 'next/server';

import { authorizeDocumentApi } from '../../../../lib/document-authorization';
import {
  getDocumentTenantContext,
  toDocumentApiItem,
} from '../../../../lib/document-model';
import {
  deleteDocument,
  getDocumentServices,
} from '../../../../lib/document-services';
import { extractPdfText } from '../../../../lib/pdf-extractor';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function GET() {
  try {
    const authorization = await authorizeDocumentApi();
    if (authorization.response) return authorization.response;

    const tenant = getDocumentTenantContext(authorization.session);
    const documents = await getDocumentServices().metadata.list(tenant);

    return NextResponse.json({
      documents: documents.map(toDocumentApiItem),
    });
  } catch (error) {
    console.error('Document list error:', error);

    return NextResponse.json(
      { error: 'Не удалось получить список документов.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeDocumentApi();
    if (authorization.response) return authorization.response;

    const tenant = getDocumentTenantContext(authorization.session);
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Файл не выбран.' }, { status: 400 });
    }

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return NextResponse.json(
        { error: 'Сейчас поддерживаются только PDF-файлы.' },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Размер файла не должен превышать 20 МБ.' },
        { status: 400 },
      );
    }

    const services = getDocumentServices();
    const id = crypto.randomUUID();
    const safeName =
      file.name
        .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]/g, '_')
        .replace(/_+/g, '_')
        .slice(-150) || 'document.pdf';
    const storedName = `${id}-${safeName}`;
    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    const now = new Date().toISOString();

    await services.storage.write(tenant, 'original', storedName, pdfBuffer);

    let document;
    try {
      document = await services.metadata.create(tenant, {
        id,
        status: 'Обрабатывается',
        originalName: file.name,
        storedName,
        mimeType: 'application/pdf',
        size: file.size,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      await services.storage.delete(tenant, 'original', storedName);
      throw error;
    }

    try {
      const extracted = await extractPdfText(pdfBuffer);
      await services.processing.save(tenant, id, {
        text: extracted.text,
        chunks: extracted.chunks,
      });

      document =
        (await services.metadata.update(tenant, id, {
          status: 'Обработан',
          pages: extracted.pages,
          textLength: extracted.text.length,
          chunksCount: extracted.chunksCount,
          processedAt: new Date().toISOString(),
          errorMessage: undefined,
        })) ?? document;
    } catch (processingError) {
      console.error('PDF processing error:', processingError);
      document =
        (await services.metadata.update(tenant, id, {
          status: 'Ошибка',
          errorMessage: 'Не удалось извлечь текст.',
        })) ?? document;
    }

    return NextResponse.json({
      document: toDocumentApiItem(document),
    });
  } catch (error) {
    console.error('Document upload error:', error);

    return NextResponse.json(
      { error: 'Не удалось загрузить документ.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authorization = await authorizeDocumentApi();
    if (authorization.response) return authorization.response;

    const tenant = getDocumentTenantContext(authorization.session);
    const id = new URL(request.url).searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Не указан идентификатор документа.' },
        { status: 400 },
      );
    }

    const document = await deleteDocument(tenant, id);
    if (!document) {
      return NextResponse.json({ error: 'Документ не найден.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Document delete error:', error);

    return NextResponse.json(
      { error: 'Не удалось удалить документ.' },
      { status: 500 },
    );
  }
}
