import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getValidatedPortalSession } from '../../../lib/portal-session';
import { listRequests } from '../../../lib/requests-store';
import { hasOrganizationPermission } from '../../../lib/organization-permissions';

const statusLabels = {
  NEW: 'Новое',
  OPEN: 'Открыто',
  IN_PROGRESS: 'В работе',
  WAITING_CUSTOMER: 'Нужно уточнение',
  RESOLVED: 'Решено',
  CLOSED: 'Закрыто',
} as const;

export default async function PortalRequestsPage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/portal/requests');
  if (!hasOrganizationPermission(session, 'requests.view')) redirect('/portal');
  const requests = await listRequests(session);

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Поддержка</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Обращения</h1>
          <p className="mt-3 text-slate-600">Заявки, сообщения и вложения вашей компании.</p>
        </div>
        {hasOrganizationPermission(session, 'requests.create') && (
          <Link
            href="/portal/requests/new"
            className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
          >
            Создать обращение
          </Link>
        )}
      </div>
      {requests.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <h2 className="text-xl font-black">Обращений пока нет</h2>
          <p className="mt-2 text-slate-600">Создайте первое обращение в поддержку Avantime.</p>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="divide-y divide-slate-100">
            {requests.map((request) => (
              <Link
                key={request.id}
                href={`/portal/requests/${encodeURIComponent(request.id)}`}
                className="grid gap-3 px-5 py-5 transition hover:bg-slate-50 md:grid-cols-[7rem_1fr_10rem_8rem] md:items-center"
              >
                <strong className="text-blue-700">{request.id}</strong>
                <span className="font-bold">{request.title}</span>
                <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                  {statusLabels[request.status]}
                </span>
                <time className="text-sm text-slate-500">
                  {new Date(request.updatedAt).toLocaleDateString('ru-RU')}
                </time>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
