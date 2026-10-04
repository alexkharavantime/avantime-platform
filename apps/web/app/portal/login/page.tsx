import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '../../../components/portal/login-form';
import { PageShell } from '../../../components/page-shell';
import { isDemoAuthEnabled } from '../../../lib/demo-auth';
import { localePath, portalCopy } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';
import { safeReturnTo } from '../../../lib/safe-return-to';
import { getValidatedPortalSession } from '../../../lib/portal-session';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const title = { lv: 'Pieslēgšanās — Avantime', ru: 'Вход в кабинет — Avantime', en: 'Sign in — Avantime' };
  return { title: title[locale] };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string;
    oidcMfa?: string;
    oidcError?: string;
    enrollmentRequired?: string;
  }>;
}) {
  const parameters = await searchParams;
  const returnTo = safeReturnTo(parameters.returnTo);
  const session = await getValidatedPortalSession();
  const locale = await getLocale();
  if (session) {
    redirect(localePath(locale, returnTo ?? (session.role === 'ADMIN' ? '/admin' : '/portal')));
  }
  const copy = portalCopy[locale].auth;
  return (
    <PageShell>
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-md px-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-950/5">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight">{copy.loginTitle}</h1>
            <p className="mt-3 text-slate-600">{copy.loginSubtitle}</p>
            <LoginForm
              returnTo={returnTo}
              locale={locale}
              demoEnabled={isDemoAuthEnabled()}
              oidcMfa={parameters.oidcMfa === '1'}
              oidcEnrollmentRequired={parameters.enrollmentRequired === '1'}
              oidcError={Boolean(parameters.oidcError)}
            />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
