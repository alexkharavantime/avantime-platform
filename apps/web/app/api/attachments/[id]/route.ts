import { NextResponse } from 'next/server';
import { getAttachmentFile } from '../../../../lib/attachments';
import { getSession } from '../../../../lib/session';

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const file = await getAttachmentFile(id);
  if (!file) return NextResponse.json({ error: 'Файл не найден.' }, { status: 404 });
  return new NextResponse(file.data, { headers: { 'Content-Type': file.mimeType, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}` } });
}
