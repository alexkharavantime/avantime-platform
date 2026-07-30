import { redirect } from 'next/navigation';

import { AdminDocumentManagementDetail } from '../../../../components/admin/document-management-detail';
import { getSession } from '../../../../lib/session';

export default async function AdminDocumentPage() {
  const session = await getSession();
  if (!session) redirect('/portal/login?returnTo=/admin/documents');
  if (session.role !== 'ADMIN') redirect('/portal');
  return <AdminDocumentManagementDetail />;
}
