'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  PortalNotificationCategory,
  PortalNotificationItem,
} from '../../lib/portal-notifications';
import { localePath, type Locale } from '../../lib/i18n';

const copy: Record<Locale, Record<string, string>> = {
  lv: {
    all: 'Visi', requests: 'Pieprasījumi', messages: 'Ziņojumi', documents: 'Dokumenti',
    system: 'Sistēmas', security: 'Drošība', aria: 'Paziņojumu kategorijas', unread: 'Nelasīti:',
    loading: 'Ielādē paziņojumus…', error: 'Paziņojumi īslaicīgi nav pieejami.',
    empty: 'Jaunu paziņojumu nav', emptyHint: 'Šeit būs drošas saites uz kabineta notikumiem.',
    read: 'Atzīmēt kā lasītu', list: 'Paziņojumu saraksts', pages: 'Paziņojumu lapas', page: 'Lapa',
    previous: 'Iepriekšējā', next: 'Nākamā', date: 'lv-LV',
  },
  ru: {
    all: 'Все', requests: 'Обращения', messages: 'Сообщения', documents: 'Документы',
    system: 'Системные', security: 'Безопасность', aria: 'Категории уведомлений', unread: 'Непрочитанных:',
    loading: 'Загрузка уведомлений…', error: 'Уведомления временно недоступны.',
    empty: 'Новых уведомлений нет', emptyHint: 'Здесь появятся безопасные ссылки на события кабинета.',
    read: 'Отметить прочитанным', list: 'Список уведомлений', pages: 'Страницы уведомлений', page: 'Страница',
    previous: 'Назад', next: 'Далее', date: 'ru-RU',
  },
  en: {
    all: 'All', requests: 'Requests', messages: 'Messages', documents: 'Documents',
    system: 'System', security: 'Security', aria: 'Notification categories', unread: 'Unread:',
    loading: 'Loading notifications…', error: 'Notifications are temporarily unavailable.',
    empty: 'No new notifications', emptyHint: 'Secure links to portal activity will appear here.',
    read: 'Mark as read', list: 'Notification list', pages: 'Notification pages', page: 'Page',
    previous: 'Previous', next: 'Next', date: 'en-GB',
  },
};

const categoryKeys: Record<PortalNotificationCategory | 'ALL', string> = {
  ALL: 'all',
  REQUEST: 'requests',
  MESSAGE: 'messages',
  DOCUMENT: 'documents',
  SYSTEM: 'system',
  SECURITY: 'security',
};

export function PortalNotificationCenter({ locale }: { locale: Locale }) {
  const [items, setItems] = useState<PortalNotificationItem[]>([]);
  const [category, setCategory] = useState<PortalNotificationCategory | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const text = copy[locale];

  useEffect(() => {
    let active = true;
    async function load() {
      setState('loading');
      try {
        const response = await fetch(`/api/portal/notifications?page=${page}`, {
          cache: 'no-store',
        });
        const result = (await response.json()) as {
          items?: PortalNotificationItem[];
          total?: number;
          unread?: number;
        };
        if (!response.ok) throw new Error('notifications-unavailable');
        if (active) {
          setItems(Array.isArray(result.items) ? result.items : []);
          setTotal(result.total ?? 0);
          setUnread(result.unread ?? 0);
          setState('ready');
        }
      } catch {
        if (active) setState('error');
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [page]);

  async function markRead(item: PortalNotificationItem) {
    if (item.read) return;
    const response = await fetch('/api/portal/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    });
    if (!response.ok) return;
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, read: true } : candidate,
      ),
    );
    setUnread((current) => Math.max(0, current - 1));
  }

  const visible = items.filter((item) => category === 'ALL' || item.category === category);
  const categories: (PortalNotificationCategory | 'ALL')[] = [
    'ALL', 'REQUEST', 'MESSAGE', 'DOCUMENT', 'SYSTEM', 'SECURITY',
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={text.aria}>
        {categories.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${category === value ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white'}`}
          >
            {text[categoryKeys[value]]}
          </button>
        ))}
        <span className="ml-auto self-center text-sm font-bold text-slate-600">
          {text.unread} {unread}
        </span>
      </div>
      {state === 'loading' && <p role="status" className="mt-6">{text.loading}</p>}
      {state === 'error' && <p role="alert" className="mt-6 font-bold text-red-700">{text.error}</p>}
      {state === 'ready' && visible.length === 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <h2 className="text-xl font-black">{text.empty}</h2>
          <p className="mt-2 text-slate-600">{text.emptyHint}</p>
        </div>
      )}
      {visible.length > 0 && (
        <ul aria-label={text.list} className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {visible.map((item) => (
            <li key={item.id} className={`p-5 ${item.read ? '' : 'bg-blue-50/50'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href={localePath(locale, item.href)}
                  onClick={() => void markRead(item)}
                  className="min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <span className="text-xs font-black uppercase tracking-widest text-blue-700">
                    {text[categoryKeys[item.category]]}
                  </span>
                  <strong className="mt-1 block text-slate-950">{item.title}</strong>
                  <time className="mt-1 block text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString(text.date)}
                  </time>
                </Link>
                {!item.read && (
                  <button
                    type="button"
                    onClick={() => void markRead(item)}
                    className="w-fit rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-blue-700"
                  >
                    {text.read}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {total > 20 && (
        <nav aria-label={text.pages} className="mt-5 flex gap-3">
          <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-300 px-4 py-2 font-bold disabled:opacity-50">{text.previous}</button>
          <span className="self-center text-sm font-bold">{text.page} {page}</span>
          <button type="button" disabled={page * 20 >= total} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-300 px-4 py-2 font-bold disabled:opacity-50">{text.next}</button>
        </nav>
      )}
    </div>
  );
}
