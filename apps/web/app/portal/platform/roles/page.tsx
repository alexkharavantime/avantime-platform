import { PlatformGovernancePage } from '../../../../components/portal/platform-governance-page';
import { platformGovernanceCopy } from '../../../../components/portal/platform-governance-page';
import { requirePlatformPagePermission } from '../../../../lib/platform-page';
import { getLocale } from '../../../../lib/i18n-server';

export default async function PlatformRolesPage() {
  await requirePlatformPagePermission('platform.roles.manage');
  const locale = await getLocale();
  const text = platformGovernanceCopy[locale].roles;
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
      eyebrow={text.eyebrow}
      title={text.title}
      description={text.description}
      locale={locale}
    >
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        {text.notice}
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
                {item.role} · {item.active ? text.active : text.disabled} · v{item.version}
              </p>
            </article>
          ),
        )}
      </div>
    </PlatformGovernancePage>
  );
}
import { getPrisma } from '@avantime/database';
