import { PlatformGovernancePage } from '../../../../components/portal/platform-governance-page';
import { requirePlatformPagePermission } from '../../../../lib/platform-page';

export default async function PlatformAuditPage() {
  await requirePlatformPagePermission('platform.audit.view');
  const prisma = await getPrisma();
  const events = prisma
    ? await prisma.productionAuditEvent.findMany({
        orderBy: { occurredAt: 'desc' },
        take: 100,
      })
    : [];
  return (
    <PlatformGovernancePage
      eyebrow="Platform governance"
      title="Глобальный аудит"
      description="Read-only evidence глобальных операций. Экспорт требует отдельного controlled approval."
    >
      <div className="grid gap-3">
        {events.map((event: { id: string; action: string; result: string; occurredAt: Date }) => (
          <article key={event.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-mono text-sm font-black">{event.action}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {event.result} · {event.occurredAt.toLocaleString('ru-RU')}
            </p>
          </article>
        ))}
      </div>
    </PlatformGovernancePage>
  );
}
import { getPrisma } from '@avantime/database';
