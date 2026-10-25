'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { localePath, portalCopy, type Locale } from '../../lib/i18n';

export function RequestAccessVerifyStatus({ token, locale }: { token: string; locale: Locale }) {
  const copy = portalCopy[locale].requestAccess;
  const [state, setState] = useState<'pending' | 'success' | 'error'>(token ? 'pending' : 'error');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch('/api/auth/access-request/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((response) => response.json() as Promise<{ verified?: boolean }>)
      .then((data) => {
        if (!cancelled) setState(data.verified ? 'success' : 'error');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="mt-6 space-y-5">
      <p
        role="status"
        className={`rounded-xl p-4 text-sm leading-6 ${
          state === 'error' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700'
        }`}
      >
        {state === 'pending' ? copy.verifyPending : state === 'success' ? copy.verifySuccess : copy.verifyError}
      </p>
      <Link
        href={localePath(locale, '/portal/login')}
        className="block text-center text-sm font-bold text-blue-700"
      >
        {copy.backToLogin}
      </Link>
    </div>
  );
}
