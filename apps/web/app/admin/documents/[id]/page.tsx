import { redirect } from 'next/navigation';

import { AdminDocumentManagementDetail } from '../../../../components/admin/document-management-detail';
import { getValidatedPortalSession } from '../../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../../lib/organization-permissions';

export default async function AdminDocumentPage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/admin/documents');
  if (!hasOrganizationPermission(session, 'documents.manage')) redirect('/portal');
  return <AdminDocumentManagementDetail />;
}
