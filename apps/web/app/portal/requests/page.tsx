import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getValidatedPortalSession } from '../../../lib/portal-session';
import { listRequestsStrict } from '../../../lib/requests-store';
import { hasOrganizationPermission } from '../../../lib/organization-permissions';
import { localePath, type Locale } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';

const copy = {
  lv: { eyebrow: 'Atbalsts', title: 'Pieprasījumi', description: 'Jūsu uzņēmuma pieteikumi, ziņojumi un pielikumi.', create: 'Izveidot pieprasījumu', empty: 'Pieprasījumu vēl nav', emptyHint: 'Izveidojiet pirmo pieprasījumu Avantime atbalstam.', loadError: 'Pieprasījumus pašlaik neizdevās ielādēt. Mēģiniet vēlreiz vēlāk.', statuses: { NEW: 'Jauns', OPEN: 'Atvērts', IN_PROGRESS: 'Procesā', WAITING_CUSTOMER: 'Nepieciešams precizējums', RESOLVED: 'Atrisināts', CLOSED: 'Slēgts' } },
  ru: { eyebrow: 'Поддержка', title: 'Обращения', description: 'Заявки, сообщения и вложения вашей компании.', create: 'Создать обращение', empty: 'Обращений пока нет', emptyHint: 'Создайте первое обращение в поддержку Avantime.', loadError: 'Не удалось загрузить обращения. Попробуйте позже.', statuses: { NEW: 'Новое', OPEN: 'Открыто', IN_PROGRESS: 'В работе', WAITING_CUSTOMER: 'Нужно уточнение', RESOLVED: 'Решено', CLOSED: 'Закрыто' } },
  en: { eyebrow: 'Support', title: 'Requests', description: 'Requests, messages and attachments for your company.', create: 'Create a request', empty: 'There are no requests yet', emptyHint: 'Create your first request for Avantime support.', loadError: 'Requests could not be loaded. Please try again later.', statuses: { NEW: 'New', OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_CUSTOMER: 'Needs clarification', RESOLVED: 'Resolved', CLOSED: 'Closed' } },
} satisfies Record<Locale, { eyebrow: string; title: string; description: string; create: string; empty: string; emptyHint: string; loadError: string; statuses: Record<'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED', string> }>;

export default async function PortalRequestsPage() {
  const locale = await getLocale();
  const text = copy[locale];
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login?returnTo=/portal/requests'));
  if (!hasOrganizationPermission(session, 'requests.view')) redirect(localePath(locale, '/portal'));
  let requests: Awaited<ReturnType<typeof listRequestsStrict>> = [];
  let requestsUnavailable = false;
  try {
    requests = await listRequestsStrict(session);
  } catch {
    requestsUnavailable = true;
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">{text.title}</h1>
          <p className="mt-3 text-slate-600">{text.description}</p>
        </div>
        {hasOrganizationPermission(session, 'requests.create') && (
          <Link
            href={localePath(locale, '/portal/requests/new')}
            className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
          >
            {text.create}
          </Link>
        )}
      </div>
      {requestsUnavailable ? (
        <p role="alert" className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
          {text.loadError}
        </p>
      ) : requests.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <h2 className="text-xl font-black">{text.empty}</h2>
          <p className="mt-2 text-slate-600">{text.emptyHint}</p>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="divide-y divide-slate-100">
            {requests.map((request) => (
              <Link
                key={request.id}
                href={localePath(locale, `/portal/requests/${encodeURIComponent(request.id)}`)}
                className="grid gap-3 px-5 py-5 transition hover:bg-slate-50 md:grid-cols-[7rem_1fr_10rem_8rem] md:items-center"
              >
                <strong className="text-blue-700">{request.id}</strong>
                <span className="font-bold">{request.title}</span>
                <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                  {text.statuses[request.status]}
                </span>
                <time className="text-sm text-slate-500">
                  {new Date(request.updatedAt).toLocaleDateString(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB')}
                </time>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
