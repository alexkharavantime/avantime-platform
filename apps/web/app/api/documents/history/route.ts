import { NextResponse } from 'next/server';

import { authorizeDocumentApi } from '../../../../lib/document-authorization';
import { getDocumentTenantContext } from '../../../../lib/document-model';
import type { DocumentHistoryItem } from '../../../../lib/document-repositories';
import { getDocumentServices } from '../../../../lib/document-services';
import {
  resolveDocumentSources,
  type DocumentSourceReference,
} from '../../../../lib/document-sources';

export const runtime = 'nodejs';

type CreateHistoryRequest = {
  question?: string;
  answer?: string;
  sources?: DocumentSourceReference[];
};

export async function GET() {
  try {
    const authorization = await authorizeDocumentApi();
    if (authorization.response) return authorization.response;

    const tenant = getDocumentTenantContext(authorization.session);
    const history = await getDocumentServices().history.list(tenant);

    return NextResponse.json({ history });
  } catch (error) {
    console.error('Knowledge history read error:', error);

    return NextResponse.json(
      { error: 'Не удалось получить историю вопросов.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeDocumentApi();
    if (authorization.response) return authorization.response;

    const tenant = getDocumentTenantContext(authorization.session);
    const body = (await request.json()) as CreateHistoryRequest;
    const question = body.question?.trim() ?? '';
    const answer = body.answer?.trim() ?? '';

    if (!question || !answer || question.length > 4_000 || answer.length > 40_000) {
      return NextResponse.json(
        { error: 'Вопрос и ответ обязательны и не должны превышать лимит.' },
        { status: 400 },
      );
    }

    const resolvedSources = await resolveDocumentSources(
      tenant,
      Array.isArray(body.sources) ? body.sources : [],
    );
    const services = getDocumentServices();
    const history = await services.history.list(tenant);
    const item: DocumentHistoryItem = {
      id: crypto.randomUUID(),
      question,
      answer,
      sources: resolvedSources.map((source, index) => ({
        number: index + 1,
        documentId: source.documentId,
        documentName: source.documentName,
        chunkId: source.chunkId,
        score: 0,
      })),
      createdAt: new Date().toISOString(),
    };

    history.unshift(item);
    await services.history.save(tenant, history.slice(0, 100));

    return NextResponse.json({ item });
  } catch (error) {
    console.error('Knowledge history save error:', error);

    return NextResponse.json(
      { error: 'Не удалось сохранить вопрос.' },
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
    const services = getDocumentServices();
    const history = await services.history.list(tenant);

    if (!id) {
      await services.history.save(tenant, []);
      return NextResponse.json({ success: true, cleared: true });
    }

    const updatedHistory = history.filter((item) => item.id !== id);
    if (updatedHistory.length === history.length) {
      return NextResponse.json(
        { error: 'Запись истории не найдена.' },
        { status: 404 },
      );
    }

    await services.history.save(tenant, updatedHistory);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Knowledge history delete error:', error);

    return NextResponse.json(
      { error: 'Не удалось удалить запись истории.' },
      { status: 500 },
    );
  }
}
