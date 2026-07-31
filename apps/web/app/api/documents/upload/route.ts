import { NextResponse } from 'next/server';

import {
  authorizeDocumentDeleteApi,
  authorizeDocumentReadApi,
  authorizeDocumentUploadApi,
} from '../../../../lib/document-authorization';
import {
  getDocumentTenantContext,
  toClientDocumentApiItem,
  toDocumentApiItem,
} from '../../../../lib/document-model';
import {
  deleteDocument,
  enqueueUploadedDocument,
  getDocumentServices,
} from '../../../../lib/document-services';
import { detectDocumentFile } from '../../../../lib/document-file-detection';
import { loadDocumentConfiguration } from '../../../../lib/document-configuration';
import { appendCriticalDocumentAudit } from '../../../../lib/production-audit';
import { authorizeCriticalOrganizationAction } from '../../../../lib/organization-authorization';
import { hasOrganizationPermission } from '../../../../lib/organization-permissions';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const authorization = await authorizeDocumentReadApi();
    if (authorization.response) return authorization.response;

    const tenant = getDocumentTenantContext(authorization.session);
    const documents = await getDocumentServices().metadata.list(tenant);

    return NextResponse.json({
      documents: documents.map((document) =>
        hasOrganizationPermission(authorization.session, 'documents.manage')
          ? toDocumentApiItem(document)
          : toClientDocumentApiItem(document),
      ),
    });
  } catch {
    console.error('Document list failed.');

    return NextResponse.json({ error: 'Не удалось получить список документов.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeDocumentUploadApi();
    if (authorization.response) return authorization.response;

    const tenant = getDocumentTenantContext(authorization.session);
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Файл не выбран.' }, { status: 400 });
    }

    const configuration = loadDocumentConfiguration();
    if (file.size > configuration.ocr.maximumFileSize) {
      return NextResponse.json({ error: 'Файл превышает допустимый размер.' }, { status: 400 });
    }

    const services = getDocumentServices();
    const id = crypto.randomUUID();
    const safeName =
      file.name
        .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]/g, '_')
        .replace(/_+/g, '_')
        .slice(-150) || 'document.pdf';
    const storedName = `${id}-${safeName}`;
    const documentBuffer = Buffer.from(await file.arrayBuffer());
    const detection = detectDocumentFile({
      content: documentBuffer,
      originalName: file.name,
      declaredMimeType: file.type,
    });
    if (!detection.processable) {
      return NextResponse.json(
        { error: 'Поддерживаются PDF, PNG и JPEG. Формат файла проверяется на сервере.' },
        { status: 400 },
      );
    }
    const now = new Date().toISOString();

    const storedObject = await services.storage.write(
      tenant,
      'original',
      storedName,
      documentBuffer,
      {
        contentType: detection.detectedMimeType,
      },
    );

    let document;
    try {
      document = await services.metadata.create(tenant, {
        id,
        status: 'UPLOADED',
        originalName: file.name,
        storedName,
        mimeType: detection.detectedMimeType,
        size: file.size,
        checksum: storedObject.checksum,
        createdAt: now,
        updatedAt: now,
        detectedMimeType: detection.detectedMimeType,
        requiresManualReview: detection.mismatch,
        intelligenceVersion: configuration.intelligenceVersion,
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
    await appendCriticalDocumentAudit(tenant, {
      action: 'document.upload',
      targetType: 'document',
      targetId: id,
      result: 'SUCCEEDED',
      safeMetadata: {
        mimeType: detection.detectedMimeType,
        size: file.size,
        queued: true,
      },
    });

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
    const authorization = await authorizeDocumentDeleteApi();
    if (authorization.response) return authorization.response;

    const critical = await authorizeCriticalOrganizationAction(authorization.session, {
      action: 'documents.delete',
      confirmation: request.headers.get('x-avantime-confirmation'),
      correlationId: request.headers.get('x-avantime-correlation-id'),
    });
    if (critical.response) return critical.response;

    const tenant = getDocumentTenantContext(authorization.session);
    const id = new URL(request.url).searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Не указан идентификатор документа.' }, { status: 400 });
    }

    const document = await deleteDocument(tenant, id);
    if (!document) {
      return NextResponse.json({ error: 'Документ не найден.' }, { status: 404 });
    }
    await appendCriticalDocumentAudit(tenant, {
      action: 'document.delete',
      targetType: 'document',
      targetId: id,
      result: 'SUCCEEDED',
      safeMetadata: { softDelete: true },
    });

    return NextResponse.json({ success: true, id });
  } catch {
    console.error('Document delete failed.');

    return NextResponse.json({ error: 'Не удалось удалить документ.' }, { status: 500 });
  }
}
