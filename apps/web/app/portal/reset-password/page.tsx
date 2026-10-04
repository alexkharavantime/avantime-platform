import { PageShell } from '../../../components/page-shell';
import { ResetPasswordForm } from '../../../components/portal/reset-password-form';
import { portalCopy } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const locale = await getLocale();
  const { token } = await searchParams;
  const activationToken = typeof token === 'string' && token.length <= 256 ? token : '';
  const copy = portalCopy[locale].auth;
  return (
    <PageShell>
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-md px-6">
          <div className="rounded-[2rem] bg-white p-8 shadow-xl">
            <p className="eyebrow">{copy.securityEyebrow}</p>
            <h1 className="mt-4 text-4xl font-black">{copy.resetTitle}</h1>
            <ResetPasswordForm locale={locale} initialToken={activationToken} />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
