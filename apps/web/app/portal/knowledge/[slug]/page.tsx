import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getKnowledgeArticle } from '../../../../lib/knowledge-store';
import { hasOrganizationPermission } from '../../../../lib/organization-permissions';
import { getValidatedPortalSession } from '../../../../lib/portal-session';
import { localePath, type Locale } from '../../../../lib/i18n';
import { getLocale } from '../../../../lib/i18n-server';

const backLabel: Record<Locale, string> = {
  lv: '← Uz zināšanu bāzi',
  ru: '← База знаний',
  en: '← Knowledge base',
};

export default async function OrganizationKnowledgeArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const locale = await getLocale();
  const session = await getValidatedPortalSession();
  if (!session) redirect(localePath(locale, '/portal/login'));
  if (!hasOrganizationPermission(session, 'knowledge.view')) redirect(localePath(locale, '/portal'));
  const article = await getKnowledgeArticle((await params).slug, false, {
    kind: 'ORGANIZATION',
    companyId: session.companyId!,
  });
  if (!article) notFound();
  return (
    <article className="mx-auto max-w-4xl px-5 py-10 sm:px-6">
      <Link href={localePath(locale, '/portal/knowledge')} className="font-bold text-blue-600">
        {backLabel[locale]}
      </Link>
      <p className="eyebrow mt-10">{article.category}</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{article.title}</h1>
      <p className="mt-5 text-lg text-slate-600">{article.summary}</p>
      <div className="mt-10 space-y-10">
        {article.sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-2xl font-black">{section.title}</h2>
            <div className="mt-4 space-y-4">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="leading-7 text-slate-700">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
