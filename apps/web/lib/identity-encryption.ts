import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_VERSION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/u;

function decodeKey(value: string) {
  const trimmed = value.trim();
  const key = /^[a-f0-9]{64}$/iu.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64url');
  if (key.length !== 32) {
    throw new Error('MFA_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
  return key;
}

function keyVersion(environment: Record<string, string | undefined>) {
  const value = environment.MFA_ENCRYPTION_KEY_VERSION?.trim() || 'v1';
  if (!KEY_VERSION_PATTERN.test(value)) {
    throw new Error('MFA_ENCRYPTION_KEY_VERSION is invalid.');
  }
  return value;
}

function previousKeys(environment: Record<string, string | undefined>) {
  const serialized = environment.MFA_ENCRYPTION_PREVIOUS_KEYS;
  if (!serialized) return new Map<string, Buffer>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('MFA_ENCRYPTION_PREVIOUS_KEYS must be a JSON object.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MFA_ENCRYPTION_PREVIOUS_KEYS must be a JSON object.');
  }
  const keys = new Map<string, Buffer>();
  for (const [version, encoded] of Object.entries(parsed)) {
    if (!KEY_VERSION_PATTERN.test(version) || typeof encoded !== 'string') {
      throw new Error('MFA_ENCRYPTION_PREVIOUS_KEYS contains an invalid entry.');
    }
    keys.set(version, decodeKey(encoded));
  }
  return keys;
}

export function getIdentityEncryptionKey(
  environment: Record<string, string | undefined> = process.env,
) {
  const value = environment.MFA_ENCRYPTION_KEY;
  if (!value) {
    throw new Error('MFA_ENCRYPTION_KEY is required for identity encryption.');
  }
  return { key: decodeKey(value), version: keyVersion(environment) };
}

export function encryptIdentitySecret(
  plaintext: string,
  purpose: 'totp' | 'oidc-pkce',
  environment: Record<string, string | undefined> = process.env,
) {
  const { key, version } = getIdentityEncryptionKey(environment);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`avantime:${purpose}:${version}`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v2',
    version,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptIdentitySecret(
  encrypted: string,
  purpose: 'totp' | 'oidc-pkce',
  environment: Record<string, string | undefined> = process.env,
) {
  const [format, version, ivText, tagText, ciphertextText] = encrypted.split('.');
  if (format !== 'v2' || !version || !ivText || !tagText || !ciphertextText) {
    throw new Error('Encrypted identity secret has an unsupported format.');
  }
  const current = getIdentityEncryptionKey(environment);
  const key =
    version === current.version ? current.key : (previousKeys(environment).get(version) ?? null);
  if (!key) throw new Error('Encrypted identity secret key version is unavailable.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAAD(Buffer.from(`avantime:${purpose}:${version}`, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
