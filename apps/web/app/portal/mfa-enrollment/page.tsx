import type { Metadata } from 'next';

import { MfaEnrollmentSetup } from '../../../components/portal/mfa-enrollment-setup';
import { portalCopy } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';

export const metadata: Metadata = {
  title: 'MFA setup — Avantime',
  robots: { index: false, follow: false },
};

export default async function MfaEnrollmentPage() {
  const locale = await getLocale();
  const copy = portalCopy[locale].auth;
  return (
    <section className="mx-auto w-full max-w-xl px-5 py-10 sm:px-6">
      <p className="eyebrow">{copy.securityEyebrow}</p>
      <h1 className="mt-3 text-3xl font-black">{copy.mfaSetupTitle}</h1>
      <p className="mt-3 text-slate-600">{copy.mfaSetupDescription}</p>
      <MfaEnrollmentSetup locale={locale} />
    </section>
  );
}