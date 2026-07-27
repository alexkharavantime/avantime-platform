import { NextResponse } from 'next/server';
import { getAttachmentFile } from '../../../../lib/attachments';
import { getSession } from '../../../../lib/session';

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const file = await getAttachmentFile(id, session);
  if (!file) return NextResponse.json({ error: 'Файл не найден.' }, { status: 404 });
  return new NextResponse(file.data, { headers: { 'Content-Type': file.mimeType, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}` } });
}
