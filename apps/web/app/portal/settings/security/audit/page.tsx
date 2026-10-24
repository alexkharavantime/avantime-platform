import { redirect } from 'next/navigation';

import { listOrganizationAudit } from '../../../../../lib/organization-audit';
import { hasOrganizationPermission } from '../../../../../lib/organization-permissions';
import { getValidatedPortalSession } from '../../../../../lib/portal-session';
import { getLocale } from '../../../../../lib/i18n-server';
import { localePath, type Locale } from '../../../../../lib/i18n';

const copy: Record<Locale, { eyebrow: string; title: string; description: string; empty: string; date: string }> = {
  lv: { eyebrow: 'Organizācijas drošība', title: 'Audita žurnāls', description: 'Tiek rādīti tikai atļautie tehniskie lauki bez dokumentu, pieprasījumu satura vai noslēpumiem.', empty: 'Pagaidām nav notikumu.', date: 'lv-LV' },
  ru: { eyebrow: 'Безопасность организации', title: 'Журнал аудита', description: 'Показываются только разрешённые технические поля без содержимого документов, обращений и секретов.', empty: 'Событий пока нет.', date: 'ru-RU' },
  en: { eyebrow: 'Organization security', title: 'Audit log', description: 'Only allowlisted technical fields are shown; document and request contents and secrets are excluded.', empty: 'No events yet.', date: 'en-GB' },
};

export default async function OrganizationAuditPage() {
  const locale = await getLocale();
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login?returnTo=/portal/settings/security/audit'));
  if (!hasOrganizationPermission(session, 'identity.audit.view')) redirect(localePath(locale, '/portal'));
  const events = await listOrganizationAudit(session);
  const text = copy[locale];
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6">
      <p className="eyebrow">{text.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">{text.title}</h1>
      <p className="mt-3 text-slate-600">{text.description}</p>
      <ul className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-5">
        {events.length === 0 && <li className="py-5 text-sm text-slate-600">{text.empty}</li>}
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
            <time className="text-sm text-slate-500">{event.occurredAt ? new Date(event.occurredAt).toLocaleString(text.date) : '—'}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}
