import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getPrisma } from '@avantime/database';
import { recordSystemEvent } from './system-events';
import { canAccessCompany } from './authorization';
import type { AppSession } from './session';
import { getRequest } from './requests-store';

export type RequestAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  downloadUrl?: string;
};
const demoAttachments = new Map<string, (RequestAttachment & { storageKey: string })[]>();
const uploadRoot = () => process.env.UPLOAD_DIR || path.join(process.cwd(), '.data', 'uploads');
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);

export async function listAttachments(publicId: string): Promise<RequestAttachment[]> {
  if (process.env.DATABASE_URL) {
    try {
      const prisma = await getPrisma();
      const request = await prisma?.supportRequest.findUnique({
        where: { publicId },
        include: { attachments: { orderBy: { createdAt: 'desc' } } },
      });
      if (request)
        return request.attachments.map(
          (item: {
            id: string;
            name: string;
            mimeType: string;
            size: number;
            createdAt: Date;
          }) => ({
            id: item.id,
            name: item.name,
            mimeType: item.mimeType,
            size: item.size,
            createdAt: item.createdAt.toISOString(),
            downloadUrl: `/api/attachments/${item.id}`,
          }),
        );
    } catch {
      console.warn('Cannot load attachments.');
      return [];
    }
  }
  return (demoAttachments.get(publicId) ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    mimeType: entry.mimeType,
    size: entry.size,
    createdAt: entry.createdAt,
    downloadUrl: `/api/attachments/${entry.id}`,
  }));
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
        const item = await prisma.requestAttachment.create({
          data: {
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            storageKey,
            requestId: request.id,
          },
        });
        await recordSystemEvent({
          level: 'INFO',
          category: 'FILES',
          message: 'Загружено вложение к обращению.',
          metadata: { requestId: publicId, attachmentId: item.id, size: file.size },
        });
        return {
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          size: item.size,
          createdAt: item.createdAt.toISOString(),
          downloadUrl: `/api/attachments/${item.id}`,
        };
      }
    } catch {
      console.warn('Cannot persist attachment metadata.');
      throw new Error('Attachment storage is unavailable.');
    }
  }
  const item = {
    id,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    storageKey,
    createdAt: new Date().toISOString(),
    downloadUrl: `/api/attachments/${id}`,
  };
  demoAttachments.set(publicId, [item, ...(demoAttachments.get(publicId) ?? [])]);
  return item;
}

export async function getAttachmentFile(id: string, session: AppSession) {
  if (process.env.DATABASE_URL) {
    try {
      const prisma = await getPrisma();
      const item = await prisma?.requestAttachment.findUnique({
        where: { id },
        include: { request: true },
      });
      if (item && canAccessCompany(session, item.request.companyId))
        return {
          name: item.name,
          mimeType: item.mimeType,
          data: await readFile(path.join(uploadRoot(), item.storageKey)),
        };
    } catch {
      console.warn('Cannot read database attachment.');
      return null;
    }
  }
  for (const [publicId, items] of demoAttachments.entries()) {
    const item = items.find((entry) => entry.id === id);
    if (item && (await getRequest(publicId, session)))
      return {
        name: item.name,
        mimeType: item.mimeType,
        data: await readFile(path.join(uploadRoot(), item.storageKey)),
      };
  }
  return null;
}
