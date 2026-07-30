'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import type { AppSession } from '../../lib/session';

const navigation = [
  { href: '/portal', label: 'Главная', exact: true },
  { href: '/portal/requests', label: 'Обращения', exact: false },
  { href: '/portal/documents', label: 'Документы', exact: false },
  { href: '/portal/knowledge', label: 'База знаний', exact: false },
  { href: '/portal/company', label: 'Компания', exact: false },
  { href: '/portal/team', label: 'Команда', exact: false },
  { href: '/portal/notifications', label: 'Уведомления', exact: false },
  { href: '/portal/settings', label: 'Настройки', exact: false },
] as const;

const publicPaths = new Set(['/portal/login', '/portal/forgot-password', '/portal/reset-password']);

function titleForPath(pathname: string) {
  if (/^\/portal\/requests\/[^/]+$/.test(pathname)) return 'Обращение';
  if (/^\/portal\/documents\/[^/]+$/.test(pathname)) return 'Документ';
  return (
    navigation.find(
      (item) => pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`)),
    )?.label ?? 'Кабинет'
  );
}

function PortalNavigation({
  pathname,
  role,
  onNavigate,
}: {
  pathname: string;
  role: AppSession['role'];
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Основная навигация" className="space-y-1">
      {navigation.map((item) => {
        const active =
          pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
            className={`block rounded-xl px-4 py-3 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
              active
                ? 'bg-white text-slate-950'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      {role === 'ADMIN' && (
        <Link
          href="/admin"
          onClick={onNavigate}
          className="mt-4 block rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-cyan-200 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
        >
          Администрирование
        </Link>
      )}
    </nav>
  );
}

export function PortalShell({
  session,
  children,
}: {
  session: AppSession | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (publicPaths.has(pathname)) return children;

  const title = titleForPath(pathname);
  const initials = session?.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <a
        href="#portal-content"
        className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-bold text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Перейти к содержимому
      </a>

      <aside className="hidden min-h-screen w-72 shrink-0 flex-col bg-slate-950 px-5 py-6 text-white lg:flex">
        <Link href="/portal" className="mb-8 flex items-center gap-3 px-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-sm font-black">
            AV
          </span>
          <span>
            <span className="block text-lg font-black">Avantime</span>
            <span className="block text-xs text-slate-400">Кабинет клиента</span>
          </span>
        </Link>
        <PortalNavigation pathname={pathname} role={session?.role ?? 'CLIENT'} />
        <p className="mt-auto px-3 text-xs leading-5 text-slate-500">
          Данные доступны только участникам вашей компании.
        </p>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Закрыть меню"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            id="portal-mobile-navigation"
            aria-label="Мобильная навигация"
            className="relative flex min-h-full w-[min(20rem,88vw)] flex-col bg-slate-950 px-5 py-6 text-white shadow-2xl"
          >
            <div className="mb-7 flex items-center justify-between">
              <strong>Avantime</strong>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold"
              >
                Закрыть
              </button>
            </div>
            <PortalNavigation
              pathname={pathname}
              role={session?.role ?? 'CLIENT'}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-expanded={mobileOpen}
                aria-controls="portal-mobile-navigation"
                onClick={() => setMobileOpen(true)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-black lg:hidden"
              >
                Меню
              </button>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold uppercase tracking-wider text-slate-500">
                  {session?.company ?? 'Кабинет клиента'}
                </p>
                <p className="truncate text-lg font-black text-slate-950">{title}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/portal/notifications"
                aria-label="Открыть уведомления"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
              >
                Уведомления
              </Link>
              <Link
                href="/portal/settings"
                title={session?.name}
                aria-label={`Настройки пользователя ${session?.name ?? ''}`}
                className="grid h-10 w-10 place-items-center rounded-full bg-blue-600 text-sm font-black text-white"
              >
                {initials || 'AV'}
              </Link>
            </div>
          </div>
          <nav aria-label="Хлебные крошки" className="mt-3 text-sm text-slate-500">
            <Link href="/portal" className="font-bold text-blue-700">
              Кабинет
            </Link>
            {pathname !== '/portal' && (
              <>
                <span aria-hidden="true"> / </span>
                <span aria-current="page">{title}</span>
              </>
            )}
          </nav>
        </header>
        <main id="portal-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
