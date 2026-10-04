import type { Metadata } from 'next';

import { PageShell } from '../../../../../components/page-shell';
import { EmailChangeConfirmation } from '../../../../../components/portal/email-change-confirmation';
import { getLocale } from '../../../../../lib/i18n-server';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const titles = {
    lv: 'E-pasta maiņas apstiprināšana — Avantime',
    ru: 'Подтверждение смены email — Avantime',
    en: 'Confirm email change — Avantime',
  } as const;
  return { title: titles[locale] };
}

export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ token }, locale] = await Promise.all([searchParams, getLocale()]);
  const title = {
    lv: 'Apstipriniet jauno e-pastu',
    ru: 'Подтвердите новый email',
    en: 'Confirm your new email',
  } as const;
  const description = {
    lv: 'Apstiprinājums atjauninās pieteikšanās e-pastu un beigs visas aktīvās sesijas.',
    ru: 'После подтверждения адрес входа изменится, а активные сессии будут завершены.',
    en: 'Confirmation changes your login email and signs out all active sessions.',
  } as const;
  return (
    <PageShell>
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-md px-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-950/5">
            <h1 className="text-3xl font-black">{title[locale]}</h1>
            <p className="mt-3 text-sm text-slate-600">{description[locale]}</p>
            <EmailChangeConfirmation token={token ?? ''} locale={locale} />
          </div>
        </div>
      </section>
    </PageShell>
  );
}