import { redirect } from 'next/navigation';

import { listOrganizationAudit } from '../../../../../lib/organization-audit';
import { hasOrganizationPermission } from '../../../../../lib/organization-permissions';
import { getValidatedPortalSession } from '../../../../../lib/portal-session';

export default async function OrganizationAuditPage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/portal/settings/security/audit');
  if (!hasOrganizationPermission(session, 'identity.audit.view')) redirect('/portal');
  const events = await listOrganizationAudit(session);
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6">
      <p className="eyebrow">Безопасность организации</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">Журнал аудита</h1>
      <p className="mt-3 text-slate-600">
        Показываются только allowlisted технические поля без содержимого документов, запросов и
        секретов.
      </p>
      <ul className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-5">
        {events.length === 0 && <li className="py-5 text-sm text-slate-600">Событий пока нет.</li>}
        {events.map((event, index) => (
          <li
            key={`${event.correlationId}-${index}`}
            className="grid gap-2 py-5 md:grid-cols-[1fr_140px_220px]"
          >
            <div>
              <p className="font-bold">{event.action}</p>
              <p className="text-xs text-slate-500">{event.targetType}</p>
            </div>
            <span className="text-sm font-bold">{event.result}</span>
            <time className="text-sm text-slate-500">{event.occurredAt ?? '—'}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}
