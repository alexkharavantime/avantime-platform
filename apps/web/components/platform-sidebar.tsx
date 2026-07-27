'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  {
    href: '/dashboard',
    label: 'Главная',
    icon: '⌂',
    available: true,
  },
  {
    href: '/dashboard/knowledge',
    label: 'База знаний',
    icon: '▤',
    available: true,
  },
  {
    href: '/dashboard/ai',
    label: 'AI-консультант',
    icon: '✦',
    available: false,
  },
  {
    href: '/dashboard/documents',
    label: 'Документы',
    icon: '▣',
    available: false,
  },
  {
    href: '/dashboard/projects',
    label: 'Проекты',
    icon: '◇',
    available: false,
  },
  {
    href: '/dashboard/support',
    label: 'Поддержка',
    icon: '◎',
    available: true,
  },
  {
    href: '/dashboard/settings',
    label: 'Настройки',
    icon: '⚙',
    available: false,
  },
];export function PlatformSidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex min-h-screen w-72 flex-col border-r border-slate-200 bg-slate-950 px-4 py-5 text-white">
      <Link href="/dashboard" className="mb-8 flex items-center gap-3 px-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 text-sm font-black">AI</span>
        <span><span className="block text-lg font-black">Avantime</span><span className="block text-xs text-slate-400">AI Platform</span></span>
      </Link>
      <nav className="space-y-1">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${active ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-base">{item.icon}</span>{item.label}
              {!item.available && <span className="ml-auto text-[10px] font-black uppercase tracking-wide text-slate-500">Скоро</span>}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-sm font-bold">PR #1 · MVP</p><p className="mt-1 text-xs leading-5 text-slate-400">Доступные и будущие разделы явно разделены.</p></div>
    </aside>
  );
}
