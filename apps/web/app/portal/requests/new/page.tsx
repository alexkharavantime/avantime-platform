import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NewRequestForm } from '../../../../components/portal/new-request-form';
import { getValidatedPortalSession } from '../../../../lib/portal-session';
import { hasOrganizationPermission } from '../../../../lib/organization-permissions';
import { localePath, type Locale } from '../../../../lib/i18n';
import { getLocale } from '../../../../lib/i18n-server';

const copy: Record<Locale, { title: string; eyebrow: string; heading: string; description: string }> = {
  lv: { title: 'Jauns pieprasījums — Avantime', eyebrow: 'Avantime atbalsts', heading: 'Jauns pieprasījums', description: 'Pieprasījums vispirms tiks saglabāts Avantime un pēc tam droši nodots atbalsta dienestam.' },
  ru: { title: 'Новое обращение — Avantime', eyebrow: 'Поддержка Avantime', heading: 'Новое обращение', description: 'Обращение сначала сохранится в Avantime, а затем безопасно передастся в службу поддержки.' },
  en: { title: 'New request — Avantime', eyebrow: 'Avantime support', heading: 'New request', description: 'Your request will be saved in Avantime first, then securely forwarded to support.' },
};

export async function generateMetadata(): Promise<Metadata> {
  return { title: copy[await getLocale()].title };
}

export default async function NewRequestPage() {
  const locale = await getLocale();
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login?returnTo=/portal/requests/new'));
  if (!hasOrganizationPermission(session, 'requests.create')) redirect(localePath(locale, '/portal/requests'));
  const text = copy[locale];
  return (
    <section className="py-10">
      <div className="mx-auto max-w-3xl px-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8">
          <p className="eyebrow">{text.eyebrow}</p>
          <h1 className="mt-4 text-4xl font-black">{text.heading}</h1>
          <p className="mt-4 text-slate-600">{text.description}</p>
          <NewRequestForm locale={locale} />
        </div>
      </div>
    </section>
  );
}
