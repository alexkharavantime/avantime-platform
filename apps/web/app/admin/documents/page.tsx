import { redirect } from 'next/navigation';

import { AdminDocumentManagement } from '../../../components/admin/document-management';
import { getSession } from '../../../lib/session';

export default async function AdminDocumentsPage() {
  const session = await getSession();
  if (!session) redirect('/portal/login?returnTo=/admin/documents');
  if (session.role !== 'ADMIN') redirect('/portal');
  return <AdminDocumentManagement />;
}
