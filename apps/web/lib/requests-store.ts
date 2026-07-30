/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPrisma } from '@avantime/database';
import { createPortalNotification } from './portal-notifications';
import type { AppSession } from './session';

export type RequestStatus = 'NEW' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED';
export type RequestPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export type AuditEvent = {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
};

export type RequestMessage = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export type SupportRequest = {
  id: string;
  title: string;
  description: string;
  status: RequestStatus;
  priority: RequestPriority;
  category: string;
  createdAt: string;
  updatedAt: string;
  jiraKey?: string;
  messages: RequestMessage[];
  audit: AuditEvent[];
  dueAt: string;
  requesterName?: string;
  requesterEmail?: string;
  companyName?: string;
  companyId?: string;
  requesterId?: string;
};

const seed: SupportRequest[] = [
  {
    id: 'AV-1042',
    title: 'Обмен заказами с интернет-магазином',
    description: 'Необходимо проверить задержку обмена заказами между сайтом и 1С.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    category: 'Интеграция',
    createdAt: '2026-07-18T09:30:00.000Z',
    updatedAt: '2026-07-21T08:15:00.000Z',
    jiraKey: 'SUP-1042',
    dueAt: '2026-07-20T09:30:00.000Z',
    companyId: 'demo-company',
    requesterId: 'demo-user',
    audit: [
      {
        id: 'a1',
        action: 'Обращение переведено в работу',
        actorName: 'Avantime',
        createdAt: '2026-07-18T10:00:00.000Z',
      },
    ],
    messages: [
      {
        id: 'm1',
        body: 'Обращение принято в работу.',
        authorName: 'Avantime',
        createdAt: '2026-07-18T10:00:00.000Z',
      },
      {
        id: 'm2',
        body: 'Подготовлены журналы обмена за последние сутки.',
        authorName: 'Demo Client',
        createdAt: '2026-07-21T08:15:00.000Z',
      },
    ],
  },
  {
    id: 'AV-1037',
    title: 'Ошибка загрузки банковской выписки',
    description: 'После загрузки файла часть строк не распознается.',
    status: 'WAITING_CUSTOMER',
    priority: 'NORMAL',
    category: '1С',
    createdAt: '2026-07-16T11:00:00.000Z',
    updatedAt: '2026-07-20T15:40:00.000Z',
    dueAt: '2026-07-18T11:00:00.000Z',
    companyId: 'demo-company',
    requesterId: 'demo-user',
    audit: [],
    messages: [],
  },
  {
    id: 'AV-1018',
    title: 'Добавить новое поле в отчет',
    description: 'Добавить регистрационный номер контрагента в отчет по продажам.',
    status: 'RESOLVED',
    priority: 'LOW',
    category: 'Доработка',
    createdAt: '2026-07-08T07:20:00.000Z',
    updatedAt: '2026-07-12T13:10:00.000Z',
    jiraKey: 'SUP-1018',
    dueAt: '2026-07-10T07:20:00.000Z',
    companyId: 'demo-company',
    requesterId: 'demo-user',
    audit: [],
    messages: [],
  },
];

const requests = [...seed];

function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function mapDbRequest(item: any): SupportRequest {
  return {
    id: item.publicId,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    category: item.category,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    jiraKey: item.jiraKey ?? undefined,
    dueAt:
      item.dueAt?.toISOString() ??
      new Date(item.createdAt.getTime() + 48 * 3600 * 1000).toISOString(),
    requesterName: item.requester?.name ?? undefined,
    requesterEmail: item.requester?.email ?? undefined,
    companyName: item.company?.name ?? undefined,
    companyId: item.companyId,
    requesterId: item.requesterId,
    audit: (item.auditEvents ?? []).map((event: any) => ({
      id: event.id,
      action: event.action,
      actorName: event.actorName,
      createdAt: event.createdAt.toISOString(),
    })),
    messages: (item.messages ?? []).map((message: any) => ({
      id: message.id,
      body: message.body,
      authorName: message.author?.name ?? 'Avantime',
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

export async function listRequests(session?: AppSession): Promise<SupportRequest[]> {
  if (session?.role === 'CLIENT' && !session.companyId) return [];
  if (databaseConfigured()) {
    try {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('Prisma unavailable');
      const items = await prisma.supportRequest.findMany({
        where: session?.role === 'CLIENT' ? { companyId: session.companyId } : undefined,
        include: {
          requester: true,
          company: true,
          messages: { include: { author: true }, orderBy: { createdAt: 'asc' } },
          auditEvents: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { updatedAt: 'desc' },
      });
      return (items as any[]).map(mapDbRequest);
    } catch {
      console.warn('Request list is unavailable.');
      return [];
    }
  }
  return requests
    .filter((item) => !session || session.role === 'ADMIN' || item.companyId === session.companyId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getRequest(id: string, session?: AppSession): Promise<SupportRequest | null> {
  if (session?.role === 'CLIENT' && !session.companyId) return null;
  if (databaseConfigured()) {
    try {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('Prisma unavailable');
      const item = await prisma.supportRequest.findFirst({
        where: {
          publicId: id,
          ...(session?.role === 'CLIENT' ? { companyId: session.companyId } : {}),
        },
        include: {
          requester: true,
          company: true,
          messages: { include: { author: true }, orderBy: { createdAt: 'asc' } },
          auditEvents: { orderBy: { createdAt: 'desc' } },
        },
      });
      return item ? mapDbRequest(item) : null;
    } catch {
      console.warn('Request lookup is unavailable.');
      return null;
    }
  }
  return (
    requests.find(
      (item) =>
        item.id === id &&
        (!session || session.role === 'ADMIN' || item.companyId === session.companyId),
    ) ?? null
  );
}

export async function createRequest(
  input: Pick<SupportRequest, 'title' | 'description' | 'priority' | 'category'>,
  session: AppSession,
): Promise<SupportRequest> {
  if (databaseConfigured()) {
    try {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('Prisma unavailable');
      if (!session.companyId) throw new Error('У пользователя не указана компания.');
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      if (!user || user.companyId !== session.companyId)
        throw new Error('Пользователь или компания не найдены.');
      const count = await prisma.supportRequest.count();
      const dueAt = new Date(
        Date.now() +
          (input.priority === 'CRITICAL' ? 4 : input.priority === 'HIGH' ? 8 : 48) * 3600 * 1000,
      );
      const item = await prisma.supportRequest.create({
        data: {
          publicId: `AV-${1043 + count}`,
          ...input,
          dueAt,
          requesterId: user.id,
          companyId: session.companyId,
          auditEvents: { create: { action: 'Обращение создано', actorName: session.name } },
        },
        include: {
          requester: true,
          company: true,
          messages: { include: { author: true } },
          auditEvents: true,
        },
      });
      const created = mapDbRequest(item);
      await createPortalNotification({
        session,
        category: 'REQUEST',
        title: `Создано обращение ${created.id}`,
        href: `/portal/requests/${encodeURIComponent(created.id)}`,
      });
      return created;
    } catch (error) {
      console.warn('Request creation is unavailable.');
      throw error;
    }
  }
  const number =
    1043 + requests.filter((item) => Number(item.id.replace('AV-', '')) >= 1043).length;
  const now = new Date().toISOString();
  const dueHours = input.priority === 'CRITICAL' ? 4 : input.priority === 'HIGH' ? 8 : 48;
  const request: SupportRequest = {
    id: `AV-${number}`,
    status: 'NEW',
    createdAt: now,
    updatedAt: now,
    dueAt: new Date(Date.now() + dueHours * 3600 * 1000).toISOString(),
    companyId: session.companyId,
    requesterId: session.userId,
    companyName: session.company,
    requesterName: session.name,
    requesterEmail: session.email,
    audit: [
      {
        id: `a-${Date.now()}`,
        action: 'Обращение создано',
        actorName: session.name,
        createdAt: now,
      },
    ],
    messages: [],
    ...input,
  };
  requests.unshift(request);
  await createPortalNotification({
    session,
    category: 'REQUEST',
    title: `Создано обращение ${request.id}`,
    href: `/portal/requests/${encodeURIComponent(request.id)}`,
  });
  return request;
}

export async function addRequestMessage(
  id: string,
  body: string,
  session: AppSession,
): Promise<SupportRequest | null> {
  if (databaseConfigured()) {
    try {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('Prisma unavailable');
      const item = await prisma.supportRequest.findFirst({
        where: {
          publicId: id,
          ...(session.role === 'CLIENT' ? { companyId: session.companyId } : {}),
        },
      });
      if (!item) return null;
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      if (!user) return null;
      await prisma.requestMessage.create({ data: { body, authorId: user.id, requestId: item.id } });
      await prisma.supportRequest.update({
        where: { id: item.id },
        data: { updatedAt: new Date() },
      });
      const updated = await getRequest(id, session);
      if (updated) {
        await createPortalNotification({
          session,
          category: 'MESSAGE',
          title: `Добавлено сообщение в обращение ${updated.id}`,
          href: `/portal/requests/${encodeURIComponent(updated.id)}`,
        });
      }
      return updated;
    } catch {
      console.warn('Request message creation is unavailable.');
      return null;
    }
  }
  const request = requests.find(
    (item) => item.id === id && (session.role === 'ADMIN' || item.companyId === session.companyId),
  );
  if (!request) return null;
  const now = new Date().toISOString();
  request.messages.push({ id: `m-${Date.now()}`, body, authorName: session.name, createdAt: now });
  request.updatedAt = now;
  await createPortalNotification({
    session,
    category: 'MESSAGE',
    title: `Добавлено сообщение в обращение ${request.id}`,
    href: `/portal/requests/${encodeURIComponent(request.id)}`,
  });
  return request;
}

export async function updateRequestStatus(
  id: string,
  status: RequestStatus,
): Promise<SupportRequest | null> {
  if (databaseConfigured()) {
    try {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('Prisma unavailable');
      const item = await prisma.supportRequest.update({
        where: { publicId: id },
        data: {
          status,
          auditEvents: {
            create: { action: `Статус изменен: ${status}`, actorName: 'Администратор Avantime' },
          },
        },
        include: {
          requester: true,
          company: true,
          messages: { include: { author: true }, orderBy: { createdAt: 'asc' } },
          auditEvents: { orderBy: { createdAt: 'desc' } },
        },
      });
      return mapDbRequest(item);
    } catch (error) {
      console.warn('Database unavailable, updating request in demo store.', error);
    }
  }

  const request = requests.find((item) => item.id === id);
  if (!request) return null;
  request.status = status;
  request.audit.unshift({
    id: `a-${Date.now()}`,
    action: `Статус изменен: ${status}`,
    actorName: 'Администратор Avantime',
    createdAt: new Date().toISOString(),
  });
  request.updatedAt = new Date().toISOString();
  return request;
}
