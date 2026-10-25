'use client';

import Link from 'next/link';
import { useState } from 'react';

import { localePath, portalCopy, type Locale } from '../../lib/i18n';

export function AccessInvitationActivationForm({
  token,
  locale,
  signedIn,
}: {
  token: string;
  locale: Locale;
  signedIn: boolean;
}) {
  const copy = portalCopy[locale].accessInvitation;
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [accountExists, setAccountExists] = useState(false);
  const [error, setError] = useState('');
  const returnTo = `/portal/accept-invitation?token=${encodeURIComponent(token)}`;
  const signInHref = `${localePath(locale, '/portal/login')}?returnTo=${encodeURIComponent(returnTo)}`;

  async function acceptInvitation(newAccount: boolean) {
    setPending(true);
    setError('');
    setAccountExists(false);
    try {
      const response = await fetch(
        newAccount ? '/api/auth/invitation/accept' : '/api/team/invitations/accept',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newAccount ? { token, password } : { token }),
        },
      );
      const result = (await response.json()) as { code?: string };
      if (!response.ok) {
        if (result.code === 'INVITATION_ACCOUNT_EXISTS') {
          setAccountExists(true);
          setError(copy.accountExists);
        } else if (result.code === 'PASSWORD_POLICY_REJECTED') {
          setError(copy.passwordPolicy);
        } else {
          setError(copy.genericError);
        }
        return;
      }
      setAccepted(true);
    } catch {
      setError(copy.genericError);
    } finally {
      setPending(false);
    }
  }

  if (!token || token.length > 256) {
    return <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{copy.invalidLink}</p>;
  }

  if (accepted) {
    return (
      <div className="mt-6 space-y-5">
        <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
          {copy.accepted}
        </p>
        <Link
          href={localePath(locale, signedIn ? '/portal' : '/portal/login')}
          className="block rounded-xl bg-blue-600 px-5 py-3 text-center font-bold text-white"
        >
          {signedIn ? copy.continueToPortal : copy.continueToLogin}
        </Link>
      </div>
    );
  }

  if (signedIn) {
    return (
      <div className="mt-6 space-y-5">
        <p className="text-sm leading-6 text-slate-600">{copy.signedInDescription}</p>
        {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={() => void acceptInvitation(false)}
          className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60"
        >
          {pending ? copy.acceptPending : copy.accept}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <p className="text-sm leading-6 text-slate-600">{copy.description}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (password !== confirmation) {
            setError(copy.passwordMismatch);
            return;
          }
          void acceptInvitation(true);
        }}
        className="space-y-5"
      >
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-700">{copy.passwordLabel}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
          />
          <span className="mt-2 block text-xs leading-5 text-slate-500">{copy.passwordHint}</span>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-700">{copy.confirmPasswordLabel}</span>
          <input
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
          />
        </label>
        {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
        {accountExists && (
          <Link className="block text-sm font-bold text-blue-700" href={signInHref}>
            {copy.signIn}
          </Link>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60"
        >
          {pending ? copy.submitPending : copy.submit}
        </button>
      </form>
    </div>
  );
}