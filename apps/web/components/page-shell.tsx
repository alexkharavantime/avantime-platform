import Link from 'next/link';
import type { ReactNode } from 'react';
import { localePath, sharedCopy, stripLocale } from '../lib/i18n';
import { getLocale, getOriginalPath } from '../lib/i18n-server';
import { SiteHeader } from './site-header';

export async function PageShell({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const currentPath = stripLocale(await getOriginalPath());
  const copy = sharedCopy[locale];

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <SiteHeader locale={locale} currentPath={currentPath} />
      {children}
      <footer className="bg-slate-950 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1fr_auto_auto]">
          <div className="max-w-md">
            <Link href={localePath(locale)} className="text-2xl font-black text-white">
              Avantime<span className="text-blue-500">.</span>
            </Link>
            <p className="mt-4 leading-7 text-slate-400">
              {copy.footer.description}
            </p>
          </div>
          <div>
            <p className="font-black text-white">{copy.footer.sections}</p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-slate-400">
              <Link href={localePath(locale, '/solutions')}>{copy.navigation.solutions}</Link>
              <Link href={localePath(locale, '/knowledge')}>{copy.navigation.knowledge}</Link>
              <Link href={localePath(locale, '/contacts')}>{copy.navigation.contact}</Link>
            </div>
          </div>
          <div>
            <p className="font-black text-white">{copy.footer.platform}</p>
            <div className="mt-4 space-y-3 text-sm text-slate-400">
              <p>{copy.footer.portal}</p>
              <p>{copy.footer.ai}</p>
              <p>{copy.footer.jira}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-xs text-slate-500 sm:flex-row sm:justify-between">
            <span>{copy.footer.copyright}</span>
            <span>{copy.footer.site}</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
