import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AttachmentPanel } from '../../../../components/portal/attachment-panel';
import { RequestMessageForm } from '../../../../components/portal/request-message-form';
import { getValidatedPortalSession } from '../../../../lib/portal-session';
import { getRequest } from '../../../../lib/requests-store';
import { hasOrganizationPermission } from '../../../../lib/organization-permissions';
import { localePath, type Locale } from '../../../../lib/i18n';
import { getLocale } from '../../../../lib/i18n-server';

const copy = {
  lv: { title: 'Pieprasījums — Avantime', back: '← Pieprasījumiem', status: { NEW: 'Jauns', OPEN: 'Atvērts', IN_PROGRESS: 'Procesā', WAITING_CUSTOMER: 'Nepieciešams precizējums', RESOLVED: 'Atrisināts', CLOSED: 'Slēgts' }, authors: { CUSTOMER: 'Klients', AVANTIME: 'Avantime', JIRA: 'Atbalsta speciālists', SYSTEM: 'Sistēma' }, delivery: { NOT_REQUIRED: null, PENDING: 'Gaida nosūtīšanu uz Jira', PROCESSING: 'Tiek sūtīts uz Jira', SENT: 'Nosūtīts uz Jira', FAILED: 'Nosūtīšana tiks atkārtota', DEAD_LETTER: 'Nav nosūtīts — sazinieties ar atbalstu' }, priority: { LOW: 'Zema', NORMAL: 'Parasta', HIGH: 'Augsta', CRITICAL: 'Kritiska' }, jira: { NOT_CONFIGURED: { label: 'Nav konfigurēts', message: 'Pieprasījums saglabāts Avantime. Jira integrācija jūsu organizācijai nav konfigurēta.' }, PENDING: { label: 'Gaida nodošanu', message: 'Pieprasījums saglabāts un gaida drošu nodošanu Jira.' }, PROCESSING: { label: 'Tiek nodots', message: 'Integrācijas pakalpojums veido Jira uzdevumu.' }, CREATED: { label: 'Uzdevums izveidots', message: 'Jira uzdevums ir veiksmīgi izveidots.' }, FAILED: { label: 'Atkārtots mēģinājums', message: 'Jira īslaicīgi nav pieejams. Pieprasījums saglabāts, nodošana tiks automātiski atkārtota.' }, DEAD_LETTER: { label: 'Nepieciešams atbalsts', message: 'Pieprasījums saglabāts, bet automātiskā nodošana nav pabeigta. Atbalsta komanda ir informēta.' } }, category: 'Kategorija', priorityLabel: 'Prioritāte', created: 'Izveidots', jiraLabel: 'Jira', integration: 'Jira integrācijas statuss', jiraStatus: 'Jira statuss:', synced: 'Sinhronizēts:', openIssue: 'Atvērt {key} Jira', description: 'Apraksts', history: 'Saziņas vēsture', noMessages: 'Ziņojumu vēl nav.', support: 'Atbalsta dienests', supportText: 'Pieprasījums tiek sinhronizēts ar atbalsta dienestu. Ja ārējais numurs vēl nav piešķirts, darbs kabinetā turpinās bez ziņojumu un pielikumu zuduma.' },
  ru: { title: 'Обращение — Avantime', back: '← К обращениям', status: { NEW: 'Новое', OPEN: 'Открыто', IN_PROGRESS: 'В работе', WAITING_CUSTOMER: 'Нужно уточнение', RESOLVED: 'Решено', CLOSED: 'Закрыто' }, authors: { CUSTOMER: 'Клиент', AVANTIME: 'Avantime', JIRA: 'Специалист поддержки', SYSTEM: 'Система' }, delivery: { NOT_REQUIRED: null, PENDING: 'Ожидает отправки в Jira', PROCESSING: 'Отправляется в Jira', SENT: 'Отправлено в Jira', FAILED: 'Будет отправлено повторно', DEAD_LETTER: 'Не отправлено — обратитесь в поддержку' }, priority: { LOW: 'Низкий', NORMAL: 'Обычный', HIGH: 'Высокий', CRITICAL: 'Критический' }, jira: { NOT_CONFIGURED: { label: 'Не настроено', message: 'Обращение сохранено в Avantime. Интеграция Jira для вашей организации не настроена.' }, PENDING: { label: 'Ожидает передачи', message: 'Обращение сохранено и ожидает безопасной передачи в Jira.' }, PROCESSING: { label: 'Передаётся', message: 'Служба интеграции создаёт задачу Jira.' }, CREATED: { label: 'Задача создана', message: 'Задача Jira успешно создана.' }, FAILED: { label: 'Повторная попытка', message: 'Jira временно недоступна. Обращение сохранено, передача будет повторена автоматически.' }, DEAD_LETTER: { label: 'Требуется поддержка', message: 'Обращение сохранено, но автоматическая передача не завершена. Команда поддержки уведомлена.' } }, category: 'Категория', priorityLabel: 'Приоритет', created: 'Создано', jiraLabel: 'Jira', integration: 'Статус интеграции Jira', jiraStatus: 'Статус Jira:', synced: 'Синхронизировано:', openIssue: 'Открыть {key} в Jira', description: 'Описание', history: 'История общения', noMessages: 'Сообщений пока нет.', support: 'Служба поддержки', supportText: 'Обращение синхронизируется со службой поддержки. Если внешний номер ещё не присвоен, работа в кабинете продолжается без потери сообщений и вложений.' },
  en: { title: 'Request — Avantime', back: '← Back to requests', status: { NEW: 'New', OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_CUSTOMER: 'Needs clarification', RESOLVED: 'Resolved', CLOSED: 'Closed' }, authors: { CUSTOMER: 'Customer', AVANTIME: 'Avantime', JIRA: 'Support specialist', SYSTEM: 'System' }, delivery: { NOT_REQUIRED: null, PENDING: 'Awaiting Jira delivery', PROCESSING: 'Sending to Jira', SENT: 'Sent to Jira', FAILED: 'Will retry delivery', DEAD_LETTER: 'Not sent — contact support' }, priority: { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High', CRITICAL: 'Critical' }, jira: { NOT_CONFIGURED: { label: 'Not configured', message: 'The request is saved in Avantime. Jira integration is not configured for your organization.' }, PENDING: { label: 'Awaiting delivery', message: 'The request is saved and waiting for secure delivery to Jira.' }, PROCESSING: { label: 'Delivering', message: 'The integration service is creating a Jira issue.' }, CREATED: { label: 'Issue created', message: 'The Jira issue was created successfully.' }, FAILED: { label: 'Retry scheduled', message: 'Jira is temporarily unavailable. The request is saved and delivery will retry automatically.' }, DEAD_LETTER: { label: 'Support required', message: 'The request is saved, but automatic delivery did not complete. The support team has been notified.' } }, category: 'Category', priorityLabel: 'Priority', created: 'Created', jiraLabel: 'Jira', integration: 'Jira integration status', jiraStatus: 'Jira status:', synced: 'Synchronized:', openIssue: 'Open {key} in Jira', description: 'Description', history: 'Conversation history', noMessages: 'There are no messages yet.', support: 'Support', supportText: 'The request is synchronized with support. If an external number has not been assigned yet, work continues in the portal without losing messages or attachments.' },
} satisfies Record<Locale, { title: string; back: string; status: Record<string, string>; authors: Record<string, string>; delivery: Record<string, string | null>; priority: Record<string, string>; jira: Record<string, { label: string; message: string }>; category: string; priorityLabel: string; created: string; jiraLabel: string; integration: string; jiraStatus: string; synced: string; openIssue: string; description: string; history: string; noMessages: string; support: string; supportText: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: copy[locale].title };
}

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
  const locale = await getLocale();
  const text = copy[locale];
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login'));
  if (!hasOrganizationPermission(session, 'requests.view')) redirect(localePath(locale, '/portal'));
  const { id } = await params;
  const item = await getRequest(id, session);
  if (!item) notFound();
  const jira = text.jira[item.jiraIntegrationStatus];
  const jiraIssueUrl = safeJiraIssueUrl(item.jiraIssueUrl);

  return (
    <section className="py-10">
      <div className="mx-auto max-w-4xl px-6">
        <Link href={localePath(locale, '/portal/requests')} className="font-bold text-blue-600">
          {text.back}
        </Link>
        <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black text-blue-600">{item.id}</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">{item.title}</h1>
            </div>
            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
              {text.status[item.status]}
            </span>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [text.category, item.category],
              [text.priorityLabel, text.priority[item.priority]],
              [text.created, new Date(item.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB')],
              [text.jiraLabel, item.jiraKey ?? jira.label],
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
            aria-label={text.integration}
          >
            <p className="font-black text-blue-900">{jira.label}</p>
            <p className="mt-2 text-sm leading-6 text-blue-800">{jira.message}</p>
            {item.jiraStatusName && (
              <p className="mt-2 text-sm text-blue-800">{text.jiraStatus} {item.jiraStatusName}</p>
            )}
            {item.jiraSynchronizedAt && (
              <p className="mt-1 text-xs text-blue-700">
                {text.synced} {new Date(item.jiraSynchronizedAt).toLocaleString(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB')}
              </p>
            )}
            {item.jiraKey && jiraIssueUrl && (
              <a
                href={jiraIssueUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block font-bold text-blue-700 underline"
              >
                {text.openIssue.replace('{key}', item.jiraKey)}
              </a>
            )}
          </div>
          <div className="mt-8">
            <h2 className="text-xl font-black">{text.description}</h2>
            <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">{item.description}</p>
          </div>
          <div className="mt-10 border-t border-slate-200 pt-8">
            <h2 className="text-xl font-black">{text.history}</h2>
            {item.messages.length ? (
              <div className="mt-5 space-y-4">
                {item.messages.map((message) => (
                  <article key={message.id} className="rounded-2xl bg-slate-50 p-5">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className="font-black text-slate-900">{message.authorName}</p>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          {text.authors[message.authorType]}
                        </p>
                      </div>
                      <time className="text-sm text-slate-500">
                        {new Date(message.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB')}
                      </time>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">
                      {message.body}
                    </p>
                    {text.delivery[message.deliveryStatus] && (
                      <p className="mt-3 text-sm font-bold text-blue-700" role="status">
                        {text.delivery[message.deliveryStatus]}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-slate-500">{text.noMessages}</p>
            )}
            {hasOrganizationPermission(session, 'requests.comment') && (
              <RequestMessageForm requestId={item.id} locale={locale} />
            )}
          </div>
          <div className="mt-8">
            <AttachmentPanel
              requestId={item.id}
              locale={locale}
              canUpload={hasOrganizationPermission(session, 'requests.comment')}
            />
          </div>
          <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <p className="font-black text-blue-900">{text.support}</p>
            <p className="mt-2 text-sm leading-6 text-blue-800">{text.supportText}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
