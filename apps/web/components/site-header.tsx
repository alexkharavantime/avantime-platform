'use client';

import Link from 'next/link';
import { useState } from 'react';

const navigation = [
  { label: 'Решения', href: '/solutions' },
  { label: 'Отрасли', href: '/#industries' },
  { label: 'Подход', href: '/#approach' },
  { label: 'База знаний', href: '/knowledge' },
  { label: 'AI-консультант', href: '/assistant' },
];

export function SiteHeader() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3" aria-label="Avantime — на главную">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-lg font-black text-white shadow-lg shadow-blue-600/20">
            A
          </span>
          <span>
            <span className="block text-xl font-black tracking-tight text-slate-950">Avantime</span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Business automation
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Основная навигация">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-semibold text-slate-600 transition hover:text-blue-600"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/portal" className="text-sm font-bold text-slate-600 transition hover:text-blue-600">
            Кабинет
          </Link>
          <Link
            href="/contacts"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-blue-600"
          >
            Обсудить задачу
          </Link>
        </div>

        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 lg:hidden"
          aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((value) => !value)}
        >
          <span className="text-xl">{isOpen ? '×' : '☰'}</span>
        </button>
      </div>

      {isOpen && (
        <div className="border-t border-slate-200 bg-white px-6 py-5 lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1" aria-label="Мобильная навигация">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className="rounded-xl px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/portal"
              onClick={() => setIsOpen(false)}
              className="rounded-xl px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Кабинет клиента
            </Link>
            <Link
              href="/contacts"
              onClick={() => setIsOpen(false)}
              className="mt-3 rounded-xl bg-blue-600 px-4 py-3 text-center font-bold text-white"
            >
              Обсудить задачу
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
