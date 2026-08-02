import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NewRequestForm } from '../../../../components/portal/new-request-form';
import { getValidatedPortalSession } from '../../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../../lib/organization-permissions';

export const metadata: Metadata = { title: 'Новое обращение — Avantime' };
export default async function NewRequestPage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/portal/requests/new');
  if (!hasOrganizationPermission(session, 'requests.create')) redirect('/portal/requests');
  return (
    <section className="py-10">
      <div className="mx-auto max-w-3xl px-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8">
          <p className="eyebrow">Поддержка Avantime</p>
          <h1 className="mt-4 text-4xl font-black">Новое обращение</h1>
          <p className="mt-4 text-slate-600">
            Обращение сначала сохранится в Avantime, а затем безопасно передастся в службу
            поддержки.
          </p>
          <NewRequestForm />
        </div>
      </div>
    </section>
  );
}
