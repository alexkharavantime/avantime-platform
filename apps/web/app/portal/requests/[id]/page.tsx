import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AttachmentPanel } from '../../../../components/portal/attachment-panel';
import { RequestMessageForm } from '../../../../components/portal/request-message-form';
import { getValidatedPortalSession } from '../../../../lib/portal-session';
import { getRequest } from '../../../../lib/requests-store';
import { hasOrganizationPermission } from '../../../../lib/organization-permissions';

export const metadata: Metadata = { title: 'Обращение — Avantime' };
const statusLabel = {
  NEW: 'Новое',
  OPEN: 'Открыто',
  IN_PROGRESS: 'В работе',
  WAITING_CUSTOMER: 'Нужно уточнение',
  RESOLVED: 'Решено',
  CLOSED: 'Закрыто',
} as const;
const authorTypeLabel = {
  CUSTOMER: 'Клиент',
  AVANTIME: 'Avantime',
  JIRA: 'Специалист поддержки',
  SYSTEM: 'Система',
} as const;
const deliveryStatusLabel = {
  NOT_REQUIRED: null,
  PENDING: 'Ожидает отправки в Jira',
  PROCESSING: 'Отправляется в Jira',
  SENT: 'Отправлено в Jira',
  FAILED: 'Будет отправлено повторно',
  DEAD_LETTER: 'Не отправлено — обратитесь в поддержку',
} as const;
const priorityLabel = {
  LOW: 'Низкий',
  NORMAL: 'Обычный',
  HIGH: 'Высокий',
  CRITICAL: 'Критический',
} as const;
const jiraStatus = {
  NOT_CONFIGURED: {
    label: 'Не настроено',
    message: 'Обращение сохранено в Avantime. Интеграция Jira для вашей организации не настроена.',
  },
  PENDING: {
    label: 'Ожидает передачи',
    message: 'Обращение сохранено и ожидает безопасной передачи в Jira.',
  },
  PROCESSING: {
    label: 'Передаётся',
    message: 'Служба интеграции создаёт задачу Jira.',
  },
  CREATED: {
    label: 'Задача создана',
    message: 'Задача Jira успешно создана.',
  },
  FAILED: {
    label: 'Повторная попытка',
    message:
      'Jira временно недоступна. Обращение сохранено, передача будет повторена автоматически.',
  },
  DEAD_LETTER: {
    label: 'Требуется поддержка',
    message:
      'Обращение сохранено, но автоматическая передача не завершена. Команда поддержки уведомлена.',
  },
} as const;

function safeJiraIssueUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login');
  if (!hasOrganizationPermission(session, 'requests.view')) redirect('/portal');
  const { id } = await params;
  const item = await getRequest(id, session);
  if (!item) notFound();
  const jira = jiraStatus[item.jiraIntegrationStatus];
  const jiraIssueUrl = safeJiraIssueUrl(item.jiraIssueUrl);

  return (
    <section className="py-10">
      <div className="mx-auto max-w-4xl px-6">
        <Link href="/portal/requests" className="font-bold text-blue-600">
          ← К обращениям
        </Link>
        <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black text-blue-600">{item.id}</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">{item.title}</h1>
            </div>
            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
              {statusLabel[item.status]}
            </span>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Категория', item.category],
              ['Приоритет', priorityLabel[item.priority]],
              ['Создано', new Date(item.createdAt).toLocaleString('ru-RU')],
              ['Jira', item.jiraKey ?? jira.label],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-600">
                  {label}
                </p>
                <p className="mt-2 font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
          <div
            className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5"
            role="status"
            aria-label="Статус интеграции Jira"
          >
            <p className="font-black text-blue-900">{jira.label}</p>
            <p className="mt-2 text-sm leading-6 text-blue-800">{jira.message}</p>
            {item.jiraStatusName && (
              <p className="mt-2 text-sm text-blue-800">Статус Jira: {item.jiraStatusName}</p>
            )}
            {item.jiraSynchronizedAt && (
              <p className="mt-1 text-xs text-blue-700">
                Синхронизировано: {new Date(item.jiraSynchronizedAt).toLocaleString('ru-RU')}
              </p>
            )}
            {item.jiraKey && jiraIssueUrl && (
              <a
                href={jiraIssueUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block font-bold text-blue-700 underline"
              >
                Открыть {item.jiraKey} в Jira
              </a>
            )}
          </div>
          <div className="mt-8">
            <h2 className="text-xl font-black">Описание</h2>
            <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">{item.description}</p>
          </div>
          <div className="mt-10 border-t border-slate-200 pt-8">
            <h2 className="text-xl font-black">История общения</h2>
            {item.messages.length ? (
              <div className="mt-5 space-y-4">
                {item.messages.map((message) => (
                  <article key={message.id} className="rounded-2xl bg-slate-50 p-5">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className="font-black text-slate-900">{message.authorName}</p>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          {authorTypeLabel[message.authorType]}
                        </p>
                      </div>
                      <time className="text-sm text-slate-500">
                        {new Date(message.createdAt).toLocaleString('ru-RU')}
                      </time>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">
                      {message.body}
                    </p>
                    {deliveryStatusLabel[message.deliveryStatus] && (
                      <p className="mt-3 text-sm font-bold text-blue-700" role="status">
                        {deliveryStatusLabel[message.deliveryStatus]}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-slate-500">Сообщений пока нет.</p>
            )}
            {hasOrganizationPermission(session, 'requests.comment') && (
              <RequestMessageForm requestId={item.id} />
            )}
          </div>
          <div className="mt-8">
            <AttachmentPanel
              requestId={item.id}
              canUpload={hasOrganizationPermission(session, 'requests.comment')}
            />
          </div>
          <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <p className="font-black text-blue-900">Служба поддержки</p>
            <p className="mt-2 text-sm leading-6 text-blue-800">
              Обращение синхронизируется со службой поддержки. Если внешний номер ещё не присвоен,
              работа в кабинете продолжается без потери сообщений и вложений.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
