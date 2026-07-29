import { NextResponse } from 'next/server';

import { getAiCostSummary } from '../../../../../lib/ai-cost-report';
import { authorizeApi } from '../../../../../lib/authorization';
import { getDocumentTenantContext } from '../../../../../lib/document-model';

export async function GET(request: Request) {
  const authorization = await authorizeApi(['ADMIN']);
  if (authorization.response) return authorization.response;
  const url = new URL(request.url);
  if (url.searchParams.has('companyId')) {
    return NextResponse.json(
      { error: 'Параметр companyId не поддерживается.', code: 'TENANT_INPUT_REJECTED' },
      { status: 400 },
    );
  }
  try {
    const tenant = getDocumentTenantContext(authorization.session);
    const summary = await getAiCostSummary({
      companyId: tenant.companyId,
    });
    return NextResponse.json({ currency: 'EUR', summary });
  } catch {
    return NextResponse.json({ error: 'AI usage ledger временно недоступен.' }, { status: 503 });
  }
}
