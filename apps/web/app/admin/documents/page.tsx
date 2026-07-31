import { redirect } from 'next/navigation';

import { AdminDocumentManagement } from '../../../components/admin/document-management';
import { getValidatedPortalSession } from '../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../lib/organization-permissions';

export default async function AdminDocumentsPage() {
  const session = await getValidatedPortalSession();
  if (!session) redirect('/portal/login?returnTo=/admin/documents');
  if (!hasOrganizationPermission(session, 'documents.manage')) redirect('/portal');
  return <AdminDocumentManagement />;
}
