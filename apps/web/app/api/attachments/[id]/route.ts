import { NextResponse } from 'next/server';
import { getAttachmentFile } from '../../../../lib/attachments';
import { authorizePortalApi } from '../../../../lib/portal-session';

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const { id } = await context.params;
  const file = await getAttachmentFile(id, authorization.session);
  if (!file) return NextResponse.json({ error: 'Файл не найден.' }, { status: 404 });
  return new NextResponse(file.data, {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    },
  });
}
