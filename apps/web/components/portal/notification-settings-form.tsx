'use client';

import { useState } from 'react';
import type { Locale } from '../../lib/i18n';

type Props = {
  initial: {
    requestCreated: boolean;
    requestUpdated: boolean;
    newMessage: boolean;
    slaAlerts: boolean;
    weeklySummary: boolean;
  };
};

const copy: Record<Locale, { fields: Record<keyof Props['initial'], string>; saving: string; saved: string; error: string; save: string }> = {
  lv: { fields: { requestCreated: 'Pieprasījuma izveide', requestUpdated: 'Statusa izmaiņas', newMessage: 'Jauni ziņojumi', slaAlerts: 'SLA un kritiski notikumi', weeklySummary: 'Iknedēļas kopsavilkums' }, saving: 'Saglabā…', saved: 'Iestatījumi saglabāti', error: 'Kļūda', save: 'Saglabāt' },
  ru: { fields: { requestCreated: 'Создание обращения', requestUpdated: 'Изменение статуса', newMessage: 'Новые сообщения', slaAlerts: 'SLA и критические события', weeklySummary: 'Еженедельная сводка' }, saving: 'Сохраняем…', saved: 'Настройки сохранены', error: 'Ошибка', save: 'Сохранить' },
  en: { fields: { requestCreated: 'Request created', requestUpdated: 'Status changed', newMessage: 'New messages', slaAlerts: 'SLA and critical events', weeklySummary: 'Weekly summary' }, saving: 'Saving…', saved: 'Settings saved', error: 'Error', save: 'Save' },
};

export function NotificationSettingsForm({ initial, locale }: Props & { locale: Locale }) {
  const [state, setState] = useState(initial);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const text = copy[locale];

  async function save() {
    setMessage(text.saving);
    setFailed(false);
    const response = await fetch('/api/account/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    setFailed(!response.ok);
    setMessage(response.ok ? text.saved : text.error);
  }

  return (
    <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-6">
      <div className="divide-y">
        {(Object.keys(text.fields) as (keyof Props['initial'])[]).map((key) => (
          <label key={key} className="flex items-center justify-between py-5">
            <strong>{text.fields[key]}</strong>
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
          {text.save}
        </button>
        {message && <span role={failed ? 'alert' : 'status'}>{message}</span>}
      </div>
    </div>
  );
}
