import { NextResponse } from 'next/server';

import { authorizeDocumentReadApi } from '../../../../lib/document-authorization';
import { getDocumentTenantContext } from '../../../../lib/document-model';
import { getDocumentServices } from '../../../../lib/document-services';

export async function GET(request: Request) {
  try {
    const authorization = await authorizeDocumentReadApi();
    if (authorization.response) return authorization.response;

    const tenant = getDocumentTenantContext(authorization.session);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Не указан документ.' }, { status: 400 });
    }

    const services = getDocumentServices();
    const document = await services.metadata.findById(tenant, id);
    if (!document) {
      return NextResponse.json({ error: 'Документ не найден.' }, { status: 404 });
    }

    const text = await services.processing.readText(tenant, document.id);
    if (text === null) {
      return NextResponse.json({ error: 'Текст документа ещё не извлечён.' }, { status: 404 });
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error('Document text error:', error);

    return NextResponse.json({ error: 'Не удалось получить текст документа.' }, { status: 500 });
  }
}
