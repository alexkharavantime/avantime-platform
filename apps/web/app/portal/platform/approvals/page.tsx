import { PlatformGovernancePage } from '../../../../components/portal/platform-governance-page';
import { requirePlatformPagePermission } from '../../../../lib/platform-page';

export default async function PlatformApprovalsPage() {
  await requirePlatformPagePermission('platform.roles.manage');
  const prisma = await getPrisma();
  const approvals = prisma
    ? await prisma.governanceApprovalRequest.findMany({
        where: { scope: 'PLATFORM' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    : [];
  return (
    <PlatformGovernancePage
      eyebrow="Platform governance"
      title="Контролируемые подтверждения"
      description="Requester и approver разделены; approval ограничен временем, payload fingerprint и single execution."
    >
      <div className="grid gap-3">
        {approvals.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">
            Активных запросов нет.
          </p>
        ) : (
          approvals.map(
            (item: { id: string; actionType: string; status: string; expiresAt: Date }) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="font-mono text-xs text-slate-500">{item.id}</p>
                <h2 className="mt-2 font-black">{item.actionType}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {item.status} · до {item.expiresAt.toLocaleString('ru-RU')}
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
