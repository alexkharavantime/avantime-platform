import { NextResponse } from 'next/server';

import { authorizeDocumentReadApi } from '../../../../lib/document-authorization';
import {
  getDocumentTenantContext,
  toClientDocumentApiItem,
  toDocumentApiItem,
} from '../../../../lib/document-model';
import { getDocumentServices } from '../../../../lib/document-services';

export async function GET(request: Request) {
  const authorization = await authorizeDocumentReadApi();
  if (authorization.response) return authorization.response;

  const tenant = getDocumentTenantContext(authorization.session);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Не указан документ.' }, { status: 400 });
  }

  const document = await getDocumentServices().metadata.findById(tenant, id);
  if (!document) {
    return NextResponse.json({ error: 'Документ не найден.' }, { status: 404 });
  }

  return NextResponse.json({
    document:
      authorization.session.role === 'ADMIN'
        ? toDocumentApiItem(document)
        : toClientDocumentApiItem(document),
  });
}
