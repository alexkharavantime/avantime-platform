import { PlatformGovernancePage } from '../../../../components/portal/platform-governance-page';
import { requirePlatformPagePermission } from '../../../../lib/platform-page';

export default async function PlatformSupportPage() {
  const session = await requirePlatformPagePermission('platform.support.access');
  const prisma = await getPrisma();
  const sessions = prisma
    ? await prisma.platformSupportSession.findMany({
        where: { actorId: session.userId, endedAt: null, expiresAt: { gt: new Date() } },
        include: { company: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  return (
    <PlatformGovernancePage
      eyebrow="Platform governance"
      title="Support-сессии"
      description="Короткоживущий доступ к одной организации требует MFA, recent authentication, ticket, причины и точного allowlist scope."
    >
      <div className="grid gap-3">
        {sessions.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">
            Активных support-сессий нет.
          </p>
        ) : (
          sessions.map(
            (item: {
              id: string;
              company: { name: string };
              ticketReference: string;
              expiresAt: Date;
            }) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-black">{item.company.name}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Ticket {item.ticketReference} · до {item.expiresAt.toLocaleString('ru-RU')}
                </p>
              </article>
            ),
          )
        )}
      </div>
    </PlatformGovernancePage>
  );
}
import { getPrisma } from '@avantime/database';
