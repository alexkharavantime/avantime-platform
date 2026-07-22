import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getPrisma } from '@avantime/database';
import { recordSystemEvent } from './system-events';

export type RequestAttachment = { id: string; name: string; mimeType: string; size: number; createdAt: string; downloadUrl?: string };
const demoAttachments = new Map<string, (RequestAttachment & { storageKey: string })[]>();
const uploadRoot = () => process.env.UPLOAD_DIR || path.join(process.cwd(), '.data', 'uploads');
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);

export async function listAttachments(publicId: string): Promise<RequestAttachment[]> {
  if (process.env.DATABASE_URL) {
    try {
      const prisma = await getPrisma();
      const request = await prisma?.supportRequest.findUnique({ where: { publicId }, include: { attachments: { orderBy: { createdAt: 'desc' } } } });
      if (request) return request.attachments.map((item: { id: string; name: string; mimeType: string; size: number; createdAt: Date }) => ({ id: item.id, name: item.name, mimeType: item.mimeType, size: item.size, createdAt: item.createdAt.toISOString(), downloadUrl: `/api/attachments/${item.id}` }));
    } catch (error) { console.warn('Cannot load attachments.', error); }
  }
  return (demoAttachments.get(publicId) ?? []).map((entry) => ({ id: entry.id, name: entry.name, mimeType: entry.mimeType, size: entry.size, createdAt: entry.createdAt, downloadUrl: `/api/attachments/${entry.id}` }));
}

export async function addAttachment(publicId: string, file: File) {
  const id = randomUUID();
  const storageKey = `${publicId}/${id}-${safeName(file.name)}`;
  const fullPath = path.join(uploadRoot(), storageKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, Buffer.from(await file.arrayBuffer()));
  if (process.env.DATABASE_URL) {
    try {
      const prisma = await getPrisma();
      const request = await prisma?.supportRequest.findUnique({ where: { publicId } });
      if (prisma && request) {
        const item = await prisma.requestAttachment.create({ data: { name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, storageKey, requestId: request.id } });
        await recordSystemEvent({ level: 'INFO', category: 'FILES', message: `Загружен файл ${file.name}` });
        return { id: item.id, name: item.name, mimeType: item.mimeType, size: item.size, createdAt: item.createdAt.toISOString(), downloadUrl: `/api/attachments/${item.id}` };
      }
    } catch (error) { console.warn('Cannot persist attachment metadata.', error); }
  }
  const item = { id, name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, storageKey, createdAt: new Date().toISOString(), downloadUrl: `/api/attachments/${id}` };
  demoAttachments.set(publicId, [item, ...(demoAttachments.get(publicId) ?? [])]);
  return item;
}

export async function getAttachmentFile(id: string) {
  if (process.env.DATABASE_URL) {
    try {
      const prisma = await getPrisma();
      const item = await prisma?.requestAttachment.findUnique({ where: { id } });
      if (item) return { name: item.name, mimeType: item.mimeType, data: await readFile(path.join(uploadRoot(), item.storageKey)) };
    } catch (error) { console.warn('Cannot read database attachment.', error); }
  }
  for (const items of demoAttachments.values()) {
    const item = items.find((entry) => entry.id === id);
    if (item) return { name: item.name, mimeType: item.mimeType, data: await readFile(path.join(uploadRoot(), item.storageKey)) };
  }
  return null;
}
