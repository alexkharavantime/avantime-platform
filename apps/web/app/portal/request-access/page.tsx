import type { Metadata } from 'next';
import { RequestAccessForm } from '../../../components/portal/request-access-form';
import { PageShell } from '../../../components/page-shell';
import { portalCopy } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';
import { isIdentityEmailDeliveryEnabled } from '../../../lib/identity-email';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const titles = {
    lv: 'Pieprasīt piekļuvi — Avantime',
    ru: 'Запросить доступ — Avantime',
    en: 'Request access — Avantime',
  } as const;
  return { title: titles[locale] };
}

export default async function RequestAccessPage() {
  const locale = await getLocale();
  const copy = portalCopy[locale].requestAccess;
  return (
    <PageShell>
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-md px-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-950/5">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight">{copy.title}</h1>
            <p className="mt-3 text-slate-600">{copy.subtitle}</p>
            <RequestAccessForm
              locale={locale}
              emailDeliveryEnabled={isIdentityEmailDeliveryEnabled()}
            />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
