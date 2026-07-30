import { randomUUID } from 'node:crypto';
import { getPrisma } from '@avantime/database';

import type { AppSession } from './session';

export type PortalNotificationCategory = 'REQUEST' | 'MESSAGE' | 'DOCUMENT' | 'SYSTEM';

export type PortalNotificationItem = {
  id: string;
  category: PortalNotificationCategory;
  title: string;
  href: string;
  read: boolean;
  createdAt: string;
};

const demoNotifications: (PortalNotificationItem & { userId: string; companyId: string })[] = [];

export function isSafePortalNotificationHref(href: string) {
  return (
    href === '/portal' ||
    href.startsWith('/portal/requests/') ||
    href.startsWith('/portal/documents/') ||
    href === '/portal/knowledge'
  );
}

export async function createPortalNotification(input: {
  session: AppSession;
  category: PortalNotificationCategory;
  title: string;
  href: string;
}) {
  if (!input.session.companyId || !isSafePortalNotificationHref(input.href)) return null;
  if (process.env.DATABASE_URL) {
    const prisma = await getPrisma();
    if (!prisma) return null;
    const item = await prisma.portalNotification.create({
      data: {
        userId: input.session.userId,
        companyId: input.session.companyId,
        category: input.category,
        title: input.title.slice(0, 180),
        href: input.href,
      },
    });
    return item.id as string;
  }
  const item = {
    id: randomUUID(),
    userId: input.session.userId,
    companyId: input.session.companyId,
    category: input.category,
    title: input.title.slice(0, 180),
    href: input.href,
    read: false,
    createdAt: new Date().toISOString(),
  } satisfies PortalNotificationItem & { userId: string; companyId: string };
  demoNotifications.unshift(item);
  return item.id;
}

export async function listPortalNotifications(
  session: AppSession,
  page = 1,
  pageSize = 20,
): Promise<{ items: PortalNotificationItem[]; total: number; unread: number; page: number }> {
  if (!session.companyId) return { items: [], total: 0, unread: 0, page: 1 };
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safePageSize = Math.min(Math.max(pageSize, 1), 50);
  if (process.env.DATABASE_URL) {
    const prisma = await getPrisma();
    if (!prisma) return { items: [], total: 0, unread: 0, page: safePage };
    const where = { userId: session.userId, companyId: session.companyId };
    const [rows, total, unread] = await prisma.$transaction([
      prisma.portalNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      prisma.portalNotification.count({ where }),
      prisma.portalNotification.count({ where: { ...where, readAt: null } }),
    ]);
    return {
      items: rows.map(
        (row: {
          id: string;
          category: PortalNotificationCategory;
          title: string;
          href: string;
          readAt: Date | null;
          createdAt: Date;
        }) => ({
          id: row.id,
          category: row.category,
          title: row.title,
          href: isSafePortalNotificationHref(row.href) ? row.href : '/portal',
          read: Boolean(row.readAt),
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      total,
      unread,
      page: safePage,
    };
  }
  const matching = demoNotifications.filter(
    (item) => item.userId === session.userId && item.companyId === session.companyId,
  );
  return {
    items: matching.slice((safePage - 1) * safePageSize, safePage * safePageSize),
    total: matching.length,
    unread: matching.filter((item) => !item.read).length,
    page: safePage,
  };
}

export async function markPortalNotificationRead(session: AppSession, id: string) {
  if (!session.companyId) return false;
  if (process.env.DATABASE_URL) {
    const prisma = await getPrisma();
    if (!prisma) return false;
    const result = await prisma.portalNotification.updateMany({
      where: { id, userId: session.userId, companyId: session.companyId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count > 0;
  }
  const item = demoNotifications.find(
    (candidate) =>
      candidate.id === id &&
      candidate.userId === session.userId &&
      candidate.companyId === session.companyId,
  );
  if (!item) return false;
  item.read = true;
  return true;
}
