import { PortalDocumentDetail } from '../../../../components/portal/document-detail';
import { redirect } from 'next/navigation';
import { getDocumentTenantContext, toClientDocumentApiItem } from '../../../../lib/document-model';
import { getDocumentServices } from '../../../../lib/document-services';
import { getValidatedPortalSession } from '../../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../../lib/organization-permissions';
import { localePath } from '../../../../lib/i18n';
import { getLocale } from '../../../../lib/i18n-server';

export default async function PortalDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await getLocale();
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login?returnTo=/portal/documents'));
  if (!hasOrganizationPermission(session, 'documents.view')) redirect(localePath(locale, '/portal'));
  const { id } = await params;
  try {
    const tenant = getDocumentTenantContext(session);
    const document = await getDocumentServices().metadata.findById(tenant, id);
    return (
      <PortalDocumentDetail
        id={id}
        locale={locale}
        initialDocument={document ? toClientDocumentApiItem(document) : null}
      />
    );
  } catch {
    return <PortalDocumentDetail id={id} locale={locale} />;
  }
}
