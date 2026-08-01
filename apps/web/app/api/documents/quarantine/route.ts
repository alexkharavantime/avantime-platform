import { NextResponse } from 'next/server';

import { authorizeDocumentReprocessApi } from '../../../../lib/document-authorization';
import { getDocumentTenantContext, toDocumentApiItem } from '../../../../lib/document-model';
import {
  listQuarantinedDocuments,
  permanentlyFailQuarantinedDocument,
  resolveQuarantinedDocument,
  retryDocumentProcessing,
} from '../../../../lib/document-quarantine';
import { getDocumentServices } from '../../../../lib/document-services';
import { appendCriticalDocumentAudit } from '../../../../lib/production-audit';

export const runtime = 'nodejs';

type QuarantineAction = 'retry' | 'resolve' | 'fail';

function isQuarantineAction(value: unknown): value is QuarantineAction {
  return value === 'retry' || value === 'resolve' || value === 'fail';
}

export async function GET() {
  const authorization = await authorizeDocumentReprocessApi();
  if (authorization.response) return authorization.response;

  try {
    const tenant = getDocumentTenantContext(authorization.session);
    const documents = await listQuarantinedDocuments(tenant, getDocumentServices());
    return NextResponse.json({
      documents: documents.map(toDocumentApiItem),
    });
  } catch {
    return NextResponse.json(
      {
        error: 'Не удалось получить документы в карантине.',
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeDocumentReprocessApi();
  if (authorization.response) return authorization.response;

  try {
    const payload = (await request.json()) as {
      documentId?: unknown;
      action?: unknown;
    };
    if (
      typeof payload.documentId !== 'string' ||
      !payload.documentId ||
      !isQuarantineAction(payload.action)
    ) {
      return NextResponse.json(
        {
          error: 'Укажите документ и допустимое действие.',
        },
        {
          status: 400,
        },
      );
    }

    const tenant = getDocumentTenantContext(authorization.session);
    const services = getDocumentServices();
    const document =
      payload.action === 'retry'
        ? (
            await retryDocumentProcessing(tenant, payload.documentId, services, {
              expectedStatuses: ['QUARANTINED'],
            })
          )?.document
        : payload.action === 'resolve'
          ? await resolveQuarantinedDocument(tenant, payload.documentId, services)
          : await permanentlyFailQuarantinedDocument(tenant, payload.documentId, services);

    if (!document) {
      return NextResponse.json(
        {
          error: 'Документ в карантине не найден.',
        },
        {
          status: 404,
        },
      );
    }
    await appendCriticalDocumentAudit(tenant, {
      action: `document.quarantine.${payload.action}`,
      targetType: 'document',
      targetId: payload.documentId,
      result: 'SUCCEEDED',
      safeMetadata: { resultingStatus: document.status },
    });

    return NextResponse.json({
      document: toDocumentApiItem(document),
    });
  } catch {
    return NextResponse.json(
      {
        error: 'Не удалось изменить состояние документа.',
      },
      {
        status: 500,
      },
    );
  }
}
