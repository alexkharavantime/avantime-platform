/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPrisma } from '@avantime/database';
import type { Prisma } from '@prisma/client';
import { loadJiraConfiguration } from './jira-configuration';
import { createPortalNotification } from './portal-notifications';
import type { AppSession } from './session';

export type RequestStatus =
  'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type RequestPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type JiraIntegrationStatus =
  'NOT_CONFIGURED' | 'PENDING' | 'PROCESSING' | 'CREATED' | 'FAILED' | 'DEAD_LETTER';

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
  authorType: 'CUSTOMER' | 'AVANTIME' | 'JIRA' | 'SYSTEM';
  deliveryStatus: 'NOT_REQUIRED' | 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DEAD_LETTER';
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
  jiraIssueId?: string;
  jiraIssueUrl?: string;
  jiraIntegrationStatus: JiraIntegrationStatus;
  jiraStatusName?: string;
  jiraSynchronizedAt?: string;
  correlationId?: string;
  idempotencyKey?: string;
  messages: RequestMessage[];
  audit: AuditEvent[];
  dueAt: string;
  requesterName?: string;
  requesterEmail?: string;
  companyName?: string;
  companyId?: string;
  requesterId?: string;
  version: number;
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
    jiraIntegrationStatus: 'CREATED',
    dueAt: '2026-07-20T09:30:00.000Z',
    companyId: 'demo-company',
    requesterId: 'demo-user',
    version: 1,
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
        authorType: 'AVANTIME',
        deliveryStatus: 'NOT_REQUIRED',
        createdAt: '2026-07-18T10:00:00.000Z',
      },
      {
        id: 'm2',
        body: 'Подготовлены журналы обмена за последние сутки.',
        authorName: 'Demo Client',
        authorType: 'CUSTOMER',
        deliveryStatus: 'SENT',
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
    jiraIntegrationStatus: 'NOT_CONFIGURED',
    dueAt: '2026-07-18T11:00:00.000Z',
    companyId: 'demo-company',
    requesterId: 'demo-user',
    version: 1,
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
    jiraIntegrationStatus: 'CREATED',
    dueAt: '2026-07-10T07:20:00.000Z',
    companyId: 'demo-company',
    requesterId: 'demo-user',
    version: 1,
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
    jiraIssueId: item.jiraIssueId ?? undefined,
    jiraIssueUrl: item.jiraIssueUrl ?? undefined,
    jiraIntegrationStatus:
      item.jiraIntegrationStatus ?? (item.jiraKey ? 'CREATED' : 'NOT_CONFIGURED'),
    jiraStatusName: item.jiraStatusName ?? undefined,
    jiraSynchronizedAt: item.jiraSyncAt?.toISOString() ?? undefined,
    correlationId: item.correlationId ?? undefined,
    idempotencyKey: item.idempotencyKey ?? undefined,
    dueAt:
      item.dueAt?.toISOString() ??
      new Date(item.createdAt.getTime() + 48 * 3600 * 1000).toISOString(),
    requesterName: item.requester?.name ?? undefined,
    requesterEmail: item.requester?.email ?? undefined,
    companyName: item.company?.name ?? undefined,
    companyId: item.companyId,
    requesterId: item.requesterId,
    version: item.version,
    audit: (item.auditEvents ?? []).map((event: any) => ({
      id: event.id,
      action: event.action,
      actorName: event.actorName,
      createdAt: event.createdAt.toISOString(),
    })),
    messages: (item.messages ?? []).map((message: any) => ({
      id: message.id,
      body: message.body,
      authorName: message.authorDisplayName ?? message.author?.name ?? 'Avantime',
      authorType:
        message.authorType ?? (message.author?.role === 'ADMIN' ? 'AVANTIME' : 'CUSTOMER'),
      deliveryStatus: message.deliveryStatus ?? 'NOT_REQUIRED',
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

export async function listRequests(session?: AppSession): Promise<SupportRequest[]> {
  if (session && !session.companyId) return [];
  if (databaseConfigured()) {
    try {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('Prisma unavailable');
      const items = await prisma.supportRequest.findMany({
        where: session ? { companyId: session.companyId } : undefined,
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
    .filter((item) => !session || item.companyId === session.companyId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getRequest(id: string, session?: AppSession): Promise<SupportRequest | null> {
  if (session && !session.companyId) return null;
  if (databaseConfigured()) {
    try {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('Prisma unavailable');
      const item = await prisma.supportRequest.findFirst({
        where: {
          publicId: id,
          ...(session ? { companyId: session.companyId } : {}),
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
    requests.find((item) => item.id === id && (!session || item.companyId === session.companyId)) ??
    null
  );
}

export async function createRequest(
  input: Pick<SupportRequest, 'title' | 'description' | 'priority' | 'category'>,
  session: AppSession,
  options: {
    correlationId?: string;
    idempotencyKey?: string;
    environment?: Record<string, string | undefined>;
  } = {},
): Promise<SupportRequest> {
  const correlationId = options.correlationId ?? crypto.randomUUID();
  const idempotencyKey = options.idempotencyKey ?? `request:${crypto.randomUUID()}`;
  if (databaseConfigured()) {
    try {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('Prisma unavailable');
      const companyId = session.companyId;
      if (!companyId) throw new Error('У пользователя не указана компания.');
      const configuration = loadJiraConfiguration(options.environment ?? process.env);
      const dueAt = new Date(
        Date.now() +
          (input.priority === 'CRITICAL' ? 4 : input.priority === 'HIGH' ? 8 : 48) * 3600 * 1000,
      );
      const result = await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
        const duplicate = await transaction.supportRequest.findUnique({
          where: { idempotencyKey },
          include: {
            requester: true,
            company: true,
            messages: { include: { author: true } },
            auditEvents: true,
          },
        });
        if (duplicate) {
          if (duplicate.companyId !== companyId || duplicate.requesterId !== session.userId) {
            throw new Error('REQUEST_IDEMPOTENCY_SCOPE_MISMATCH');
          }
          return { item: duplicate, duplicate: true };
        }
        const user = await transaction.user.findFirst({
          where: {
            id: session.userId,
            memberships: {
              some: { companyId, active: true, status: 'ACTIVE' },
            },
          },
        });
        if (!user) throw new Error('Пользователь или компания не найдены.');
        const mapping = configuration.enabled
          ? await transaction.jiraOrganizationMapping.findUnique({
              where: { companyId },
            })
          : null;
        const enqueue = Boolean(configuration.enabled && mapping?.enabled);
        const item = await transaction.supportRequest.create({
          data: {
            publicId: `AV-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
            ...input,
            dueAt,
            requesterId: user.id,
            companyId,
            correlationId,
            idempotencyKey,
            jiraIntegrationStatus: enqueue ? 'PENDING' : 'NOT_CONFIGURED',
            auditEvents: { create: { action: 'Обращение создано', actorName: session.name } },
            ...(enqueue && mapping
              ? {
                  jiraOperations: {
                    create: {
                      companyId,
                      mappingId: mapping.id,
                      mappingVersion: mapping.version,
                      maxAttempts: configuration.maximumAttempts,
                      idempotencyKey: `jira:create:${idempotencyKey}`,
                      correlationId,
                      projectKey: mapping.projectKey,
                      issueType: mapping.issueType ?? configuration.defaultIssueType,
                      componentId: mapping.componentId,
                      requestType: mapping.requestType,
                    },
                  },
                }
              : {}),
          },
          include: {
            requester: true,
            company: true,
            messages: { include: { author: true } },
            auditEvents: true,
          },
        });
        await transaction.productionAuditEvent.create({
          data: {
            companyId,
            actorId: session.userId,
            action: 'request.created',
            targetType: 'support_request',
            targetId: item.publicId,
            result: 'SUCCEEDED',
            correlationId,
            safeMetadata: {
              requestId: item.publicId,
              priority: item.priority,
              category: item.category,
              jiraIntegrationStatus: item.jiraIntegrationStatus,
            },
          },
        });
        if (enqueue) {
          await transaction.productionAuditEvent.create({
            data: {
              companyId,
              actorId: session.userId,
              action: 'jira.operation.enqueued',
              targetType: 'support_request',
              targetId: item.publicId,
              result: 'SUCCEEDED',
              correlationId,
              safeMetadata: { requestId: item.publicId },
            },
          });
        }
        return { item, duplicate: false };
      });
      const created = mapDbRequest(result.item);
      if (result.duplicate) return created;
      await createPortalNotification({
        session,
        category: 'REQUEST',
        title: `Создано обращение ${created.id}`,
        href: `/portal/requests/${encodeURIComponent(created.id)}`,
      });
      return created;
    } catch (error) {
      if ((error as { code?: unknown })?.code === 'P2002') {
        const prisma = await getPrisma();
        const duplicate = await prisma?.supportRequest.findUnique({
          where: { idempotencyKey },
          include: {
            requester: true,
            company: true,
            messages: { include: { author: true } },
            auditEvents: true,
          },
        });
        if (
          duplicate &&
          duplicate.companyId === session.companyId &&
          duplicate.requesterId === session.userId
        ) {
          return mapDbRequest(duplicate);
        }
      }
      console.warn('Request creation is unavailable.');
      throw error;
    }
  }
  const duplicate = requests.find((item) => item.idempotencyKey === idempotencyKey);
  if (duplicate) {
    if (duplicate.companyId !== session.companyId || duplicate.requesterId !== session.userId) {
      throw new Error('REQUEST_IDEMPOTENCY_SCOPE_MISMATCH');
    }
    return duplicate;
  }
  const number =
    1043 + requests.filter((item) => Number(item.id.replace('AV-', '')) >= 1043).length;
  const now = new Date().toISOString();
  const dueHours = input.priority === 'CRITICAL' ? 4 : input.priority === 'HIGH' ? 8 : 48;
  const request: SupportRequest = {
    id: `AV-${number}`,
    status: 'NEW',
    jiraIntegrationStatus: 'NOT_CONFIGURED',
    createdAt: now,
    updatedAt: now,
    dueAt: new Date(Date.now() + dueHours * 3600 * 1000).toISOString(),
    companyId: session.companyId,
    requesterId: session.userId,
    version: 1,
    companyName: session.company,
    requesterName: session.name,
    requesterEmail: session.email,
    correlationId,
    idempotencyKey,
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
  options: {
    idempotencyKey?: string;
    correlationId?: string;
    environment?: Record<string, string | undefined>;
  } = {},
): Promise<SupportRequest | null> {
  if (databaseConfigured()) {
    try {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('Prisma unavailable');
      const idempotencyKey = options.idempotencyKey ?? `jira:comment:${crypto.randomUUID()}`;
      const correlationId = options.correlationId ?? crypto.randomUUID();
      const configuration = loadJiraConfiguration(options.environment ?? process.env);
      const created = await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
        const duplicate = await transaction.requestMessage.findUnique({
          where: { idempotencyKey },
        });
        if (duplicate) {
          const duplicateRequest = await transaction.supportRequest.findUnique({
            where: { id: duplicate.requestId },
          });
          if (
            !duplicateRequest ||
            duplicateRequest.publicId !== id ||
            duplicateRequest.companyId !== session.companyId ||
            duplicate.authorId !== session.userId
          ) {
            throw new Error('JIRA_COMMENT_IDEMPOTENCY_SCOPE_MISMATCH');
          }
          return false;
        }
        const item = await transaction.supportRequest.findFirst({
          where: { publicId: id, companyId: session.companyId },
        });
        if (!item) return null;
        const user = await transaction.user.findFirst({
          where: {
            id: session.userId,
            memberships: {
              some: { companyId: item.companyId, active: true, status: 'ACTIVE' },
            },
          },
        });
        if (!user) return null;
        const mapping = configuration.enabled
          ? await transaction.jiraOrganizationMapping.findUnique({
              where: { companyId: item.companyId },
            })
          : null;
        const enqueue = Boolean(
          configuration.enabled &&
          mapping?.enabled &&
          item.jiraIntegrationStatus === 'CREATED' &&
          item.jiraIssueId &&
          item.jiraKey,
        );
        const message = await transaction.requestMessage.create({
          data: {
            body,
            authorId: user.id,
            authorType: 'CUSTOMER',
            authorDisplayName: user.name,
            deliveryStatus: enqueue ? 'PENDING' : 'NOT_REQUIRED',
            requestId: item.id,
            idempotencyKey,
            correlationId,
          },
        });
        if (enqueue && mapping) {
          await transaction.jiraOperation.create({
            data: {
              requestId: item.id,
              companyId: item.companyId,
              mappingId: mapping.id,
              mappingVersion: mapping.version,
              operationType: 'ADD_COMMENT',
              maxAttempts: configuration.maximumAttempts,
              idempotencyKey: `jira:add-comment:${idempotencyKey}`,
              correlationId,
              projectKey: mapping.projectKey,
              issueType: mapping.issueType ?? configuration.defaultIssueType,
              componentId: mapping.componentId,
              requestType: mapping.requestType,
              localCommentId: message.id,
            },
          });
          await transaction.productionAuditEvent.create({
            data: {
              companyId: item.companyId,
              actorId: user.id,
              action: 'jira.comment.enqueued',
              targetType: 'support_request',
              targetId: item.publicId,
              result: 'SUCCEEDED',
              correlationId,
              safeMetadata: { requestId: item.publicId, safeCommentId: message.id },
            },
          });
        }
        await transaction.supportRequest.update({
          where: { id: item.id },
          data: { updatedAt: new Date() },
        });
        return true;
      });
      if (created === null) return null;
      const updated = await getRequest(id, session);
      if (updated && created) {
        await createPortalNotification({
          session,
          category: 'MESSAGE',
          title: `Добавлено сообщение в обращение ${updated.id}`,
          href: `/portal/requests/${encodeURIComponent(updated.id)}`,
        });
      }
      return updated;
    } catch (error) {
      console.warn('Request message creation is unavailable.');
      if (error instanceof Error && error.message.startsWith('JIRA_COMMENT_')) throw error;
      return null;
    }
  }
  const request = requests.find((item) => item.id === id && item.companyId === session.companyId);
  if (!request) return null;
  const now = new Date().toISOString();
  request.messages.push({
    id: `m-${Date.now()}`,
    body,
    authorName: session.name,
    authorType: 'CUSTOMER',
    deliveryStatus: 'NOT_REQUIRED',
    createdAt: now,
  });
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
          version: { increment: 1 },
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
  request.version += 1;
  request.audit.unshift({
    id: `a-${Date.now()}`,
    action: `Статус изменен: ${status}`,
    actorName: 'Администратор Avantime',
    createdAt: new Date().toISOString(),
  });
  request.updatedAt = new Date().toISOString();
  return request;
}
