import { PortalDocumentDetail } from '../../../../components/portal/document-detail';

export default async function PortalDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PortalDocumentDetail id={id} />;
}
