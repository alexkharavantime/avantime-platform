import { checkServerIdentity } from 'node:tls';

export type TlsValidationInput = {
  hostname: string;
  subjectAlternativeNames: string;
  validFrom: string;
  validTo: string;
  protocol: string;
  cipherName: string;
  hsts: string | null;
  redirectsToHttps: boolean;
  internalEndpointsPublic: boolean;
};

const WEAK_CIPHER = /(?:RC4|3DES|DES-CBC|NULL|EXPORT|MD5|CBC3)/i;

export function validateTlsHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.local') ||
    normalized.includes('/') ||
    !/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(normalized)
  ) {
    throw new Error('TLS hostname is invalid or local.');
  }
  return normalized;
}

export function evaluateTlsValidation(
  input: TlsValidationInput,
  options: { warningDays?: number; minimumDays?: number; now?: Date } = {},
) {
  const hostname = validateTlsHostname(input.hostname);
  const now = options.now ?? new Date();
  const warningDays = options.warningDays ?? 30;
  const minimumDays = options.minimumDays ?? 7;
  const validFrom = new Date(input.validFrom);
  const validTo = new Date(input.validTo);
  if (!Number.isFinite(validFrom.getTime()) || !Number.isFinite(validTo.getTime())) {
    throw new Error('Certificate validity dates are invalid.');
  }
  const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / 86_400_000);
  const hostnameError = checkServerIdentity(hostname, {
    subjectaltname: input.subjectAlternativeNames,
  } as Parameters<typeof checkServerIdentity>[1]);
  const protocolAllowed = ['TLSv1.2', 'TLSv1.3'].includes(input.protocol);
  const cipherAllowed = !WEAK_CIPHER.test(input.cipherName);
  const hstsPresent = Boolean(input.hsts && /max-age=(?:[3-9]\d{6,}|\d{8,})/i.test(input.hsts));
  const checks = {
    hostnameMatch: !hostnameError,
    currentlyValid: validFrom <= now && daysRemaining >= 0,
    expiryMinimum: daysRemaining >= minimumDays,
    expiryWarning: daysRemaining >= warningDays,
    protocolAllowed,
    cipherAllowed,
    hstsPresent,
    redirectsToHttps: input.redirectsToHttps,
    internalEndpointsPrivate: !input.internalEndpointsPublic,
  };
  return {
    hostname,
    daysRemaining,
    checks,
    status: Object.entries(checks)
      .filter(([name]) => name !== 'expiryWarning')
      .every(([, passed]) => passed)
      ? ('passed' as const)
      : ('failed' as const),
  };
}
