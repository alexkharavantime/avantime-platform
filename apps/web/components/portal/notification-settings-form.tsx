'use client';

import { useState } from 'react';

type Props = {
  initial: {
    requestCreated: boolean;
    requestUpdated: boolean;
    newMessage: boolean;
    slaAlerts: boolean;
    weeklySummary: boolean;
  };
};

const fields = [
  ['requestCreated', 'Создание обращения'],
  ['requestUpdated', 'Изменение статуса'],
  ['newMessage', 'Новые сообщения'],
  ['slaAlerts', 'SLA и критические события'],
  ['weeklySummary', 'Еженедельная сводка'],
] as const;

export function NotificationSettingsForm({ initial }: Props) {
  const [state, setState] = useState(initial);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  async function save() {
    setMessage('Сохраняем…');
    setFailed(false);
    const response = await fetch('/api/account/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    setFailed(!response.ok);
    setMessage(response.ok ? 'Настройки сохранены' : 'Ошибка');
  }

  return (
    <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-6">
      <div className="divide-y">
        {fields.map(([key, title]) => (
          <label key={key} className="flex items-center justify-between py-5">
            <strong>{title}</strong>
            <input
              type="checkbox"
              checked={state[key]}
              onChange={(event) => setState({ ...state, [key]: event.target.checked })}
            />
          </label>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          className="rounded-full bg-blue-600 px-6 py-3 font-black text-white"
        >
          Сохранить
        </button>
        {message && <span role={failed ? 'alert' : 'status'}>{message}</span>}
      </div>
    </div>
  );
}
