import { getPrisma } from '@avantime/database';

import { PlatformGovernancePage, platformGovernanceCopy } from '../../../../components/portal/platform-governance-page';
import { requirePlatformPagePermission } from '../../../../lib/platform-page';
import { getLocale } from '../../../../lib/i18n-server';

export default async function PlatformSupportPage() {
  const session = await requirePlatformPagePermission('platform.support.access');
  const locale = await getLocale();
  const text = platformGovernanceCopy[locale].support;
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
      eyebrow={text.eyebrow}
      title={text.title}
      description={text.description}
      locale={locale}
    >
      <div className="grid gap-3">
        {sessions.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">
            {text.empty}
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
                <p className="mt-2 text-sm font-bold text-emerald-700" role="status">
                  {text.active}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Ticket {item.ticketReference} · {text.datePrefix} {item.expiresAt.toLocaleString(text.date)}
                </p>
              </article>
            ),
          )
        )}
      </div>
    </PlatformGovernancePage>
  );
}
