import { PortalDocumentDetail } from '../../../../components/portal/document-detail';
import { redirect } from 'next/navigation';
import { getDocumentTenantContext, toClientDocumentApiItem } from '../../../../lib/document-model';
import { getDocumentServices } from '../../../../lib/document-services';
import { getValidatedPortalSession } from '../../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../../lib/organization-permissions';

export default async function PortalDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/portal/documents');
  if (!hasOrganizationPermission(session, 'documents.view')) redirect('/portal');
  const { id } = await params;
  try {
    const tenant = getDocumentTenantContext(session);
    const document = await getDocumentServices().metadata.findById(tenant, id);
    return (
      <PortalDocumentDetail
        id={id}
        initialDocument={document ? toClientDocumentApiItem(document) : null}
      />
    );
  } catch {
    return <PortalDocumentDetail id={id} />;
  }
}
