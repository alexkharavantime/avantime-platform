import { PageShell } from '../../../components/page-shell';
import { ForgotPasswordForm } from '../../../components/portal/forgot-password-form';
import { portalCopy } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';

export default async function Page() {
  const locale = await getLocale();
  const copy = portalCopy[locale].auth;
  return (
    <PageShell>
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-md px-6">
          <div className="rounded-[2rem] bg-white p-8 shadow-xl">
            <p className="eyebrow">{copy.securityEyebrow}</p>
            <h1 className="mt-4 text-4xl font-black">{copy.forgotTitle}</h1>
            <p className="mt-3 text-slate-600">{copy.forgotSubtitle}</p>
            <ForgotPasswordForm locale={locale} />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
