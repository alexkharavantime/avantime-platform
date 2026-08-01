import { PlatformGovernancePage } from '../../../../components/portal/platform-governance-page';
import { requirePlatformPagePermission } from '../../../../lib/platform-page';

export default async function PlatformRolesPage() {
  await requirePlatformPagePermission('platform.roles.manage');
  const prisma = await getPrisma();
  const assignments = prisma
    ? await prisma.platformRoleAssignment.findMany({
        include: { user: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      })
    : [];
  return (
    <PlatformGovernancePage
      eyebrow="Platform governance"
      title="Platform-роли"
      description="Назначения platform scope не создают membership и не дают неограниченный доступ к tenant data."
    >
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        Назначение или удаление PLATFORM_OWNER выполняется только через controlled approval.
      </p>
      <div className="mt-6 grid gap-3">
        {assignments.map(
          (item: {
            id: string;
            user: { name: string };
            role: string;
            active: boolean;
            version: number;
          }) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-black">{item.user.name}</h2>
              <p className="mt-2 font-mono text-sm text-slate-600">
                {item.role} · {item.active ? 'ACTIVE' : 'DISABLED'} · v{item.version}
              </p>
            </article>
          ),
        )}
      </div>
    </PlatformGovernancePage>
  );
}
import { getPrisma } from '@avantime/database';
