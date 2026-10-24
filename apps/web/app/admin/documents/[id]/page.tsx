import { redirect } from 'next/navigation';

import { AdminDocumentManagementDetail } from '../../../../components/admin/document-management-detail';
import { getValidatedPortalSession } from '../../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../../lib/organization-permissions';
import { localePath } from '../../../../lib/i18n';
import { getLocale } from '../../../../lib/i18n-server';

export default async function AdminDocumentPage() {
  const locale = await getLocale();
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login?returnTo=/admin/documents'));
  if (!hasOrganizationPermission(session, 'documents.manage')) redirect(localePath(locale, '/portal'));
  return <AdminDocumentManagementDetail locale={locale} />;
}
