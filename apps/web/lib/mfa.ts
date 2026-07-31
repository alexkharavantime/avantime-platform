import {
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import {
  decryptIdentitySecret,
  encryptIdentitySecret,
  getIdentityEncryptionKey,
} from './identity-encryption';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_ALLOWED_SKEW = 1;
const RECOVERY_CODE_COUNT = 10;

export type TotpVerification = { valid: true; counter: number } | { valid: false; counter?: never };

function base32Encode(bytes: Buffer) {
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return result;
}

function base32Decode(value: string) {
  const normalized = value.toUpperCase().replace(/=+$/u, '').replace(/\s+/gu, '');
  let bits = 0;
  let accumulator = 0;
  const output: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('TOTP secret is invalid.');
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function getMfaEncryptionKey(environment: Record<string, string | undefined> = process.env) {
  return getIdentityEncryptionKey(environment).key;
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function encryptTotpSecret(
  secret: string,
  environment: Record<string, string | undefined> = process.env,
) {
  return encryptIdentitySecret(secret, 'totp', environment);
}

export function decryptTotpSecret(
  encrypted: string,
  environment: Record<string, string | undefined> = process.env,
) {
  const [version, ivText, tagText, ciphertextText] = encrypted.split('.');
  if (version === 'v2') {
    return decryptIdentitySecret(encrypted, 'totp', environment);
  }
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) {
    throw new Error('Encrypted TOTP secret has an unsupported format.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getMfaEncryptionKey(environment),
    Buffer.from(ivText, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function totpAtCounter(secret: string, counter: number) {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('TOTP counter is invalid.');
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function verifyTotp(
  secret: string,
  otp: string,
  options: { now?: Date; lastUsedCounter?: number | null; allowedSkew?: number } = {},
): TotpVerification {
  if (!/^\d{6}$/u.test(otp)) return { valid: false };
  const nowCounter = Math.floor((options.now ?? new Date()).getTime() / 1000 / TOTP_PERIOD_SECONDS);
  const allowedSkew = options.allowedSkew ?? TOTP_ALLOWED_SKEW;
  for (let offset = -allowedSkew; offset <= allowedSkew; offset += 1) {
    const counter = nowCounter + offset;
    if (counter < 0 || counter <= (options.lastUsedCounter ?? -1)) continue;
    const expected = Buffer.from(totpAtCounter(secret, counter));
    const actual = Buffer.from(otp);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      return { valid: true, counter };
    }
  }
  return { valid: false };
}

function normalizeRecoveryCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/gu, '').toUpperCase();
}

export function hashRecoveryCode(value: string) {
  return createHash('sha256').update(normalizeRecoveryCode(value)).digest('hex');
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 20) {
    throw new Error('Recovery code count is invalid.');
  }
  return Array.from({ length: count }, () => {
    const encoded = randomBytes(10).toString('base64url').replace(/[-_]/gu, '').toUpperCase();
    const value = encoded.padEnd(12, 'X').slice(0, 12);
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
  });
}

export function createTotpUri(input: { secret: string; accountLabel: string; issuer?: string }) {
  const issuer = input.issuer ?? 'Avantime';
  const label = `${issuer}:${input.accountLabel}`;
  const parameters = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${parameters.toString()}`;
}
