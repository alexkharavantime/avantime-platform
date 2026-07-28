import { NextResponse } from 'next/server';

import { authorizeDocumentApi } from '../../../../lib/document-authorization';
import { getDocumentTenantContext, toDocumentApiItem } from '../../../../lib/document-model';
import {
  deleteDocument,
  enqueueUploadedDocument,
  getDocumentServices,
} from '../../../../lib/document-services';

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

    return NextResponse.json({ error: 'Не удалось получить список документов.' }, { status: 500 });
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

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
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

    const storedObject = await services.storage.write(tenant, 'original', storedName, pdfBuffer, {
      contentType: 'application/pdf',
    });

    let document;
    try {
      document = await services.metadata.create(tenant, {
        id,
        status: 'UPLOADED',
        originalName: file.name,
        storedName,
        mimeType: 'application/pdf',
        size: file.size,
        checksum: storedObject.checksum,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      await services.storage.delete(tenant, 'original', storedName);
      throw error;
    }

    try {
      const enqueued = await enqueueUploadedDocument(tenant, id, services);
      if (!enqueued) {
        throw new Error('Document metadata disappeared before enqueue.');
      }
      document = enqueued.document;
    } catch {
      return NextResponse.json(
        {
          error: 'Документ сохранён, но пока не поставлен в очередь обработки.',
        },
        {
          status: 503,
        },
      );
    }

    return NextResponse.json(
      {
        document: toDocumentApiItem(document),
      },
      {
        status: 202,
      },
    );
  } catch {
    console.error('Document upload failed.');

    return NextResponse.json({ error: 'Не удалось загрузить документ.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authorization = await authorizeDocumentApi();
    if (authorization.response) return authorization.response;

    const tenant = getDocumentTenantContext(authorization.session);
    const id = new URL(request.url).searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Не указан идентификатор документа.' }, { status: 400 });
    }

    const document = await deleteDocument(tenant, id);
    if (!document) {
      return NextResponse.json({ error: 'Документ не найден.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Document delete error:', error);

    return NextResponse.json({ error: 'Не удалось удалить документ.' }, { status: 500 });
  }
}
