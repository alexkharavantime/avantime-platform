import type { Metadata } from 'next';
import { RequestAccessVerifyStatus } from '../../../../components/portal/request-access-verify-status';
import { PageShell } from '../../../../components/page-shell';
import { portalCopy } from '../../../../lib/i18n';
import { getLocale } from '../../../../lib/i18n-server';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const titles = {
    lv: 'E-pasta apstiprināšana — Avantime',
    ru: 'Подтверждение email — Avantime',
    en: 'Email verification — Avantime',
  } as const;
  return { title: titles[locale] };
}

export default async function RequestAccessVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const locale = await getLocale();
  const copy = portalCopy[locale].requestAccess;
  return (
    <PageShell>
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-md px-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-950/5">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight">{copy.verifyTitle}</h1>
            <RequestAccessVerifyStatus token={token ?? ''} locale={locale} />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
