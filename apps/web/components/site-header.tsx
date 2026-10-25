'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { localePath, sharedCopy, type Locale } from '../lib/i18n';
import { BackLink } from './back-link';

type SiteHeaderProps = { locale: Locale; currentPath: string };

export function SiteHeader({ locale, currentPath }: SiteHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const copy = sharedCopy[locale];
  const navigation = [
    { label: copy.navigation.oneC, href: localePath(locale, '/solutions/1c') },
    { label: copy.navigation.solutions, href: localePath(locale, '/solutions') },
    { label: copy.navigation.approach, href: localePath(locale, '/#approach') },
    { label: copy.navigation.knowledge, href: localePath(locale, '/knowledge') },
    { label: copy.navigation.assistant, href: localePath(locale, '/assistant') },
  ];

  useEffect(() => {
    setCanGoBack(document.referrer.startsWith(window.location.origin));
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <Link href={localePath(locale)} className="flex items-center gap-3" aria-label="Avantime">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-lg font-black text-white shadow-lg shadow-blue-600/20">
            A
          </span>
          <span>
            <span className="block text-xl font-black tracking-tight text-slate-950">Avantime</span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              {copy.navigation.brandTagline}
            </span>
          </span>
        </Link>

        <nav className="mx-4 hidden min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm xl:flex" aria-label={copy.navigation.solutions}>
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 xl:flex">
          <div className="flex items-center gap-1 rounded-full border border-slate-200 p-1" aria-label={copy.navigation.languageLabel}>
            {(['lv', 'ru', 'en'] as const).map((candidate) => (
              <Link
                key={candidate}
                href={localePath(candidate, currentPath)}
                aria-current={candidate === locale ? 'page' : undefined}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${candidate === locale ? 'bg-slate-950 text-white' : 'text-slate-500 hover:text-blue-600'}`}
              >
                {candidate.toUpperCase()}
              </Link>
            ))}
          </div>
          <Link
            href={localePath(locale, '/portal')}
            className="text-sm font-bold text-slate-600 transition hover:text-blue-600"
          >
            {copy.navigation.portal}
          </Link>
          <Link
            href={localePath(locale, '/#contact')}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-blue-600"
          >
            {copy.navigation.contact}
          </Link>
        </div>

        <div className="flex items-center gap-2 xl:hidden">
          <div className="flex items-center gap-1 rounded-full border border-slate-200 p-1" aria-label={copy.navigation.languageLabel}>
            {(['lv', 'ru', 'en'] as const).map((candidate) => (
              <Link
                key={candidate}
                href={localePath(candidate, currentPath)}
                aria-current={candidate === locale ? 'page' : undefined}
                className={`rounded-full px-2 py-1 text-[10px] font-bold sm:px-2.5 sm:text-[11px] ${candidate === locale ? 'bg-slate-950 text-white' : 'text-slate-500 hover:text-blue-600'}`}
              >
                {candidate.toUpperCase()}
              </Link>
            ))}
          </div>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 xl:hidden"
            aria-label={isOpen ? copy.navigation.menuClose : copy.navigation.menuOpen}
            aria-expanded={isOpen}
            onClick={() => setIsOpen((value) => !value)}
          >
            <span className="text-xl">{isOpen ? '×' : '☰'}</span>
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-3 right-3 top-full rounded-b-3xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-950/15 xl:hidden">
          <nav className="mx-auto grid max-w-7xl gap-1" aria-label={copy.navigation.solutions}>
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className="rounded-xl px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-blue-700"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={localePath(locale, '/portal')}
              onClick={() => setIsOpen(false)}
              className="rounded-xl px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-blue-700"
            >
              {copy.navigation.portal}
            </Link>
            <Link
              href={localePath(locale, '/#contact')}
              onClick={() => setIsOpen(false)}
              className="mt-3 rounded-xl bg-blue-600 px-4 py-3 text-center font-bold text-white"
            >
              {copy.navigation.contact}
            </Link>
          </nav>
        </div>
      )}

      {canGoBack && (
        <div className="border-t border-slate-200/70 bg-white/95 px-6 py-2">
          <div className="mx-auto flex max-w-7xl items-center">
            <BackLink
              fallbackHref={localePath(locale)}
              className="inline-flex min-h-10 items-center rounded-full border border-blue-200 bg-white px-5 text-sm font-bold text-blue-700 shadow-sm shadow-blue-950/5 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              {copy.navigation.back}
            </BackLink>
          </div>
        </div>
      )}

    </header>
  );
}
