'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type {
  PortalNotificationCategory,
  PortalNotificationItem,
} from '../../lib/portal-notifications';

const categories: { value: PortalNotificationCategory | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Все' },
  { value: 'REQUEST', label: 'Обращения' },
  { value: 'MESSAGE', label: 'Сообщения' },
  { value: 'DOCUMENT', label: 'Документы' },
  { value: 'SYSTEM', label: 'Системные' },
];

export function PortalNotificationCenter() {
  const [items, setItems] = useState<PortalNotificationItem[]>([]);
  const [category, setCategory] = useState<PortalNotificationCategory | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

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
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Категории уведомлений">
        {categories.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={category === item.value}
            onClick={() => setCategory(item.value)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${
              category === item.value
                ? 'bg-blue-600 text-white'
                : 'border border-slate-300 bg-white'
            }`}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto self-center text-sm font-bold text-slate-600">
          Непрочитанных: {unread}
        </span>
      </div>
      {state === 'loading' && (
        <p role="status" className="mt-6">
          Загрузка уведомлений…
        </p>
      )}
      {state === 'error' && (
        <p role="alert" className="mt-6 font-bold text-red-700">
          Уведомления временно недоступны.
        </p>
      )}
      {state === 'ready' && visible.length === 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <h2 className="text-xl font-black">Новых уведомлений нет</h2>
          <p className="mt-2 text-slate-600">
            Здесь появятся безопасные ссылки на события кабинета.
          </p>
        </div>
      )}
      {visible.length > 0 && (
        <ul
          aria-label="Список уведомлений"
          className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white"
        >
          {visible.map((item) => (
            <li key={item.id} className={`p-5 ${item.read ? '' : 'bg-blue-50/50'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href={item.href}
                  onClick={() => void markRead(item)}
                  className="min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <span className="text-xs font-black uppercase tracking-widest text-blue-700">
                    {item.category}
                  </span>
                  <strong className="mt-1 block text-slate-950">{item.title}</strong>
                  <time className="mt-1 block text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString('ru-RU')}
                  </time>
                </Link>
                {!item.read && (
                  <button
                    type="button"
                    onClick={() => void markRead(item)}
                    className="w-fit rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-blue-700"
                  >
                    Отметить прочитанным
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {total > 20 && (
        <nav aria-label="Страницы уведомлений" className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-lg border border-slate-300 px-4 py-2 font-bold disabled:opacity-50"
          >
            Назад
          </button>
          <span className="self-center text-sm font-bold">Страница {page}</span>
          <button
            type="button"
            disabled={page * 20 >= total}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-lg border border-slate-300 px-4 py-2 font-bold disabled:opacity-50"
          >
            Далее
          </button>
        </nav>
      )}
    </div>
  );
}
