import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteHeader } from './site-header';

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <SiteHeader />
      {children}
      <footer className="bg-slate-950 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1fr_auto_auto]">
          <div className="max-w-md">
            <Link href="/" className="text-2xl font-black text-white">Avantime<span className="text-blue-500">.</span></Link>
            <p className="mt-4 leading-7 text-slate-400">1С, искусственный интеллект и интеграции для практической автоматизации бизнеса.</p>
          </div>
          <div>
            <p className="font-black text-white">Разделы</p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-slate-400">
              <Link href="/solutions">Решения</Link><Link href="/knowledge">База знаний</Link><Link href="/contacts">Контакты</Link>
            </div>
          </div>
          <div>
            <p className="font-black text-white">Платформа</p>
            <div className="mt-4 space-y-3 text-sm text-slate-400"><p>Клиентский кабинет</p><p>AI-консультант</p><p>Интеграция с Jira</p></div>
          </div>
        </div>
        <div className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-xs text-slate-500 sm:flex-row sm:justify-between"><span>© 2026 Avantime</span><span>Сайт · Клиентский портал · AI-платформа</span></div></div>
      </footer>
    </main>
  );
}
