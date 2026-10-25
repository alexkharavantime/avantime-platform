'use client';

import Link from 'next/link';
import { useState } from 'react';
import { localePath, portalCopy, type Locale } from '../../lib/i18n';

export function RequestAccessForm({
  locale,
  emailDeliveryEnabled,
}: {
  locale: Locale;
  emailDeliveryEnabled: boolean;
}) {
  const copy = portalCopy[locale].requestAccess;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult('');
    try {
      const response = await fetch('/api/auth/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, companyName, comment, locale }),
      });
      if (!response.ok) {
        setResult(copy.genericError);
        return;
      }
      const data = (await response.json()) as { deliveryStatus?: string };
      const deliveryMessage = {
        accepted: copy.successMessage,
        disabled: copy.deliveryDisabledMessage,
        failed: copy.deliveryFailedMessage,
      }[data.deliveryStatus ?? ''];
      if (!deliveryMessage) {
        setResult(copy.genericError);
        return;
      }
      setResult(deliveryMessage);
      setSubmitted(true);
    } catch {
      setResult(copy.genericError);
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-8 space-y-5">
        <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          {result}
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

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <p role="note" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
        {copy.emailVerificationNotice}
      </p>
      {!emailDeliveryEnabled && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          {copy.emailDeliveryDisabledNotice}
        </p>
      )}
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-slate-700">{copy.nameLabel}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          maxLength={200}
          autoComplete="name"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-slate-700">{copy.emailLabel}</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-slate-700">{copy.companyLabel}</span>
        <input
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          required
          minLength={2}
          maxLength={200}
          autoComplete="organization"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-slate-700">{copy.commentLabel}</span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={2000}
          rows={3}
          placeholder={copy.commentPlaceholder}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-60"
      >
        {pending ? copy.submitPending : copy.submit}
      </button>
      {result && <p role="alert" className="text-sm font-bold text-red-700">{result}</p>}
      <Link
        href={localePath(locale, '/portal/login')}
        className="block text-center text-sm font-bold text-blue-700"
      >
        {copy.backToLogin}
      </Link>
    </form>
  );
}
