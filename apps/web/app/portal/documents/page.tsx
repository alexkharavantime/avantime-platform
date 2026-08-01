import { PortalDocumentList } from '../../../components/portal/document-list';
import { redirect } from 'next/navigation';
import { getValidatedPortalSession } from '../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../lib/organization-permissions';

export default async function PortalDocumentsPage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/portal/documents');
  if (!hasOrganizationPermission(session, 'documents.view')) redirect('/portal');
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
      <p className="eyebrow">Документы компании</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">Документы</h1>
      <p className="mt-3 max-w-3xl text-slate-600">
        Состояние обработки, OCR, ручной проверки и индексации без внутренних технических деталей.
      </p>
      <div className="mt-8">
        <PortalDocumentList />
      </div>
    </div>
  );
}
