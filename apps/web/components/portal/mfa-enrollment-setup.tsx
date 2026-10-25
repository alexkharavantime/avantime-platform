'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';

import { localePath, portalCopy, type Locale } from '../../lib/i18n';

type Enrollment = {
  methodId: string;
  secret: string;
  otpauthUri: string;
};

export function MfaEnrollmentSetup({ locale }: { locale: Locale }) {
  const copy = portalCopy[locale].auth;
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  async function beginEnrollment() {
    setPending(true);
    setMessage('');
    try {
      const response = await fetch('/api/account/security/mfa/totp/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        cache: 'no-store',
      });
      const data = (await response.json()) as Enrollment | { error?: string };
      if (!response.ok || !('methodId' in data)) {
        setMessage(copy.mfaSetupExpired);
        return;
      }
      setEnrollment(data);
    } catch {
      setMessage(copy.mfaSetupExpired);
    } finally {
      setPending(false);
    }
  }

  async function confirmEnrollment() {
    if (!enrollment) return;
    setPending(true);
    setMessage('');
    try {
      const response = await fetch('/api/account/security/mfa/totp/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ methodId: enrollment.methodId, code }),
        cache: 'no-store',
      });
      const data = (await response.json()) as { recoveryCodes?: string[]; error?: string };
      if (!response.ok || !Array.isArray(data.recoveryCodes)) {
        setMessage(response.status === 401 ? copy.mfaSetupExpired : data.error ?? copy.genericError);
        return;
      }
      setRecoveryCodes(data.recoveryCodes);
      setEnrollment(null);
      setCode('');
    } catch {
      setMessage(copy.genericError);
    } finally {
      setPending(false);
    }
  }

  if (recoveryCodes.length > 0) {
    return (
      <div className="mt-6 space-y-5" data-testid="mfa-recovery-codes">
        <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
          {copy.mfaSetupRecoveryNotice}
        </p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {recoveryCodes.map((recoveryCode) => (
            <li key={recoveryCode} className="rounded-lg bg-slate-100 px-4 py-3 font-mono text-sm">
              {recoveryCode}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => window.location.replace(localePath(locale, '/portal/login'))}
          className="w-full rounded-full bg-blue-600 px-5 py-3 font-bold text-white"
        >
          {copy.mfaSetupContinue}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {!enrollment ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => void beginEnrollment()}
          className="w-full rounded-full bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60"
        >
          {copy.mfaSetupStart}
        </button>
      ) : (
        <div className="space-y-5">
          <div className="mx-auto w-fit rounded-lg bg-white p-3">
            <QRCodeSVG
              value={enrollment.otpauthUri}
              size={208}
              level="M"
              role="img"
              aria-label={copy.mfaSetupQrLabel}
              data-testid="mfa-enrollment-qr"
            />
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-bold">{copy.mfaSetupQrLabel}</summary>
            <code className="mt-2 block break-all rounded-lg bg-slate-100 p-3 text-sm">
              {enrollment.secret}
            </code>
          </details>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">{copy.mfaSetupCodeLabel}</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>
          <button
            type="button"
            disabled={pending || code.length !== 6}
            onClick={() => void confirmEnrollment()}
            className="w-full rounded-full bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60"
          >
            {copy.mfaSetupConfirm}
          </button>
        </div>
      )}
      {message && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm">{message}</p>}
    </div>
  );
}