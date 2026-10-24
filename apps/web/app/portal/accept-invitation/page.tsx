import type { Metadata } from 'next';

import { AccessInvitationActivationForm } from '../../../components/portal/access-invitation-activation-form';
import { PageShell } from '../../../components/page-shell';
import { getValidatedPortalSession } from '../../../lib/portal-session';
import { portalCopy } from '../../../lib/i18n';
import { getLocale } from '../../../lib/i18n-server';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: portalCopy[locale].accessInvitation.title };
}

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ token }, locale, session] = await Promise.all([
    searchParams,
    getLocale(),
    getValidatedPortalSession(),
  ]);
  const copy = portalCopy[locale].accessInvitation;

  return (
    <PageShell>
      <section className="bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-lg px-5 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 sm:p-8">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1 className="mt-4 text-3xl font-black tracking-tight">{copy.title}</h1>
            <AccessInvitationActivationForm
              token={token ?? ''}
              locale={locale}
              signedIn={Boolean(session)}
            />
          </div>
        </div>
      </section>
    </PageShell>
  );
}