'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { Locale } from '../../lib/i18n';

const copy: Record<Locale, { confirm: string; success: string; failure: string; login: string }> = {
  lv: {
    confirm: 'Apstiprināt jauno e-pastu',
    success: 'E-pasts mainīts. Drošības nolūkos visas sesijas ir beigušās.',
    failure: 'Saite nav derīga vai tās termiņš ir beidzies.',
    login: 'Turpināt uz pieteikšanos',
  },
  ru: {
    confirm: 'Подтвердить новый email',
    success: 'Email изменён. Для безопасности все сессии завершены.',
    failure: 'Ссылка недействительна или срок её действия истёк.',
    login: 'Перейти ко входу',
  },
  en: {
    confirm: 'Confirm new email',
    success: 'Email changed. All sessions were signed out for security.',
    failure: 'The link is invalid or has expired.',
    login: 'Continue to sign in',
  },
};

export function EmailChangeConfirmation({ token, locale }: { token: string; locale: Locale }) {
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const text = copy[locale];

  async function confirm() {
    setPending(true);
    try {
      const response = await fetch('/api/auth/email-change/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error(text.failure);
      setConfirmed(true);
      setMessage(text.success);
    } catch {
      setMessage(text.failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
      {confirmed ? (
        <Link href="/portal/login" className="inline-flex rounded-xl bg-slate-950 px-5 py-3 font-bold text-white">
          {text.login}
        </Link>
      ) : (
        <button
          type="button"
          disabled={!token || pending}
          onClick={() => void confirm()}
          className="rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-60"
        >
          {text.confirm}
        </button>
      )}
    </div>
  );
}