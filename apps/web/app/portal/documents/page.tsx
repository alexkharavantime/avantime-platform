import { PortalDocumentList } from '../../../components/portal/document-list';
import { redirect } from 'next/navigation';
import { getValidatedPortalSession } from '../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../lib/organization-permissions';
import { localePath, type Locale } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';

const copy = {
  lv: { eyebrow: 'Uzņēmuma dokumenti', title: 'Dokumenti', description: 'Apstrādes, OCR, manuālās pārbaudes un indeksēšanas statuss bez iekšējām tehniskām detaļām.' },
  ru: { eyebrow: 'Документы компании', title: 'Документы', description: 'Состояние обработки, OCR, ручной проверки и индексации без внутренних технических деталей.' },
  en: { eyebrow: 'Company documents', title: 'Documents', description: 'Processing, OCR, manual review and indexing status without internal technical details.' },
} satisfies Record<Locale, { eyebrow: string; title: string; description: string }>;

export default async function PortalDocumentsPage() {
  const locale = await getLocale();
  const text = copy[locale];
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login?returnTo=/portal/documents'));
  if (!hasOrganizationPermission(session, 'documents.view')) redirect(localePath(locale, '/portal'));
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
      <p className="eyebrow">{text.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">{text.title}</h1>
      <p className="mt-3 max-w-3xl text-slate-600">{text.description}</p>
      <div className="mt-8">
        <PortalDocumentList locale={locale} />
      </div>
    </div>
  );
}
