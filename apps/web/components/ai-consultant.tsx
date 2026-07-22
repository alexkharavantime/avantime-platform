'use client';

import { FormEvent, useState } from 'react';

type Message = { role: 'assistant' | 'user'; text: string };

const starters = [
  'Автоматизация обращений клиентов',
  'Интеграция 1С и Jira',
  'AI-помощник для сотрудников',
];

export function AiConsultant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: 'Опишите процесс или проблему. Я предложу возможный первый этап автоматизации.',
    },
  ]);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || loading) return;
    setMessages((items) => [...items, { role: 'user', text: clean }]);
    setValue('');
    setLoading(true);

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: clean }),
      });
      const data = (await response.json()) as { answer?: string };
      setMessages((items) => [
        ...items,
        {
          role: 'assistant',
          text: data.answer ?? 'Предлагаю начать с короткого обследования процесса.',
        },
      ]);
    } catch {
      setMessages((items) => [
        ...items,
        {
          role: 'assistant',
          text: 'Не удалось получить ответ. Опишите задачу через форму контактов — мы разберем ее вручную.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(value);
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-blue-950/10">
      <div className="flex items-center justify-between bg-slate-950 px-6 py-5 text-white">
        <div>
          <p className="font-black">Avantime AI-консультант</p>
          <p className="mt-1 text-xs text-slate-400">Демонстрационная версия</p>
        </div>
        <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
          online
        </span>
      </div>

      <div className="h-[390px] space-y-4 overflow-y-auto bg-slate-50 p-5" aria-live="polite">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[88%] rounded-2xl p-4 text-sm leading-6 ${
              message.role === 'user'
                ? 'ml-auto rounded-tr-sm bg-blue-600 text-white'
                : 'rounded-tl-sm border border-slate-200 bg-white text-slate-700'
            }`}
          >
            {message.text}
          </div>
        ))}
        {loading && (
          <div className="inline-flex rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            Анализирую задачу…
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => void send(starter)}
              className="rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
            >
              {starter}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label="Сообщение AI-консультанту"
            placeholder="Например: хотим сократить ручной ввод заказов"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-200 px-4 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="rounded-xl bg-blue-600 px-5 font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Отправить
          </button>
        </form>
      </div>
    </div>
  );
}
