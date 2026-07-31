import { pbkdf2Sync, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const PASSWORD_POLICY = Object.freeze({
  minimumLength: 12,
  maximumLength: 128,
});

const SCRYPT_VERSION = 'v1';
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const LEGACY_PBKDF2_MINIMUM_ITERATIONS = 210_000;

const COMMON_PASSWORDS = new Set(
  [
    '123456789012',
    'administrator',
    'adminadminadmin',
    'avantime',
    'password',
    'password1234',
    'qwertyqwerty',
    'letmeinletmein',
    'welcome12345',
  ].map((value) => value.toLowerCase()),
);

export type PasswordPolicyResult =
  | { valid: true }
  | {
      valid: false;
      code: 'PASSWORD_POLICY_REJECTED';
      error: string;
    };

export type PasswordVerification = {
  valid: boolean;
  needsRehash: boolean;
};

function scryptDigest(password: string, salt: Buffer, cost = SCRYPT_COST) {
  return scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: cost,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAX_MEMORY,
  });
}

function safeEqual(actual: Buffer, expected: Buffer) {
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeEmail(value: string) {
  return value.trim().normalize('NFKC').toLowerCase();
}

export function validatePasswordPolicy(password: string, email?: string): PasswordPolicyResult {
  if (password.length < PASSWORD_POLICY.minimumLength) {
    return {
      valid: false,
      code: 'PASSWORD_POLICY_REJECTED',
      error: `Пароль должен содержать не менее ${PASSWORD_POLICY.minimumLength} символов.`,
    };
  }
  if (password.length > PASSWORD_POLICY.maximumLength) {
    return {
      valid: false,
      code: 'PASSWORD_POLICY_REJECTED',
      error: `Пароль должен содержать не более ${PASSWORD_POLICY.maximumLength} символов.`,
    };
  }

  const normalizedPassword = password.normalize('NFKC').toLowerCase();
  if (COMMON_PASSWORDS.has(normalizedPassword)) {
    return {
      valid: false,
      code: 'PASSWORD_POLICY_REJECTED',
      error: 'Выберите менее распространённый пароль.',
    };
  }

  if (email) {
    const normalizedEmail = normalizeEmail(email);
    const localPart = normalizedEmail.split('@')[0] ?? '';
    if (
      normalizedPassword === normalizedEmail ||
      (localPart.length >= 4 && normalizedPassword.includes(localPart))
    ) {
      return {
        valid: false,
        code: 'PASSWORD_POLICY_REJECTED',
        error: 'Пароль не должен содержать ваш email.',
      };
    }
  }

  return { valid: true };
}

export function hashPassword(password: string) {
  if (password.length > PASSWORD_POLICY.maximumLength) {
    throw new Error('Password exceeds the configured maximum length.');
  }
  const salt = randomBytes(16);
  const digest = scryptDigest(password, salt);
  return [
    'scrypt',
    SCRYPT_VERSION,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('base64url'),
    digest.toString('base64url'),
  ].join('$');
}

function verifyScrypt(password: string, stored: string): PasswordVerification {
  const [algorithm, version, costText, blockSizeText, parallelizationText, saltText, digestText] =
    stored.split('$');
  const cost = Number(costText);
  const blockSize = Number(blockSizeText);
  const parallelization = Number(parallelizationText);
  if (
    algorithm !== 'scrypt' ||
    version !== SCRYPT_VERSION ||
    !Number.isSafeInteger(cost) ||
    cost < 2 ||
    cost > SCRYPT_COST ||
    (cost & (cost - 1)) !== 0 ||
    blockSize !== SCRYPT_BLOCK_SIZE ||
    parallelization !== SCRYPT_PARALLELIZATION ||
    !saltText ||
    !digestText
  ) {
    return { valid: false, needsRehash: false };
  }

  try {
    const expected = Buffer.from(digestText, 'base64url');
    const actual = scryptDigest(password, Buffer.from(saltText, 'base64url'), cost);
    const valid = safeEqual(actual, expected);
    return {
      valid,
      needsRehash: valid && cost !== SCRYPT_COST,
    };
  } catch {
    return { valid: false, needsRehash: false };
  }
}

function verifyLegacyPbkdf2(password: string, stored: string): PasswordVerification {
  const [algorithm, iterationsText, salt, digest] = stored.split('$');
  const iterations = Number(iterationsText);
  if (
    algorithm !== 'pbkdf2' ||
    !Number.isSafeInteger(iterations) ||
    iterations < LEGACY_PBKDF2_MINIMUM_ITERATIONS ||
    iterations > 1_000_000 ||
    !salt ||
    !digest
  ) {
    return { valid: false, needsRehash: false };
  }
  try {
    const actual = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    const expected = Buffer.from(digest, 'hex');
    const valid = safeEqual(actual, expected);
    return { valid, needsRehash: valid };
  } catch {
    return { valid: false, needsRehash: false };
  }
}

export function verifyPasswordVersioned(password: string, stored: string): PasswordVerification {
  if (password.length > PASSWORD_POLICY.maximumLength) {
    return { valid: false, needsRehash: false };
  }
  if (stored.startsWith('scrypt$')) return verifyScrypt(password, stored);
  if (stored.startsWith('pbkdf2$')) return verifyLegacyPbkdf2(password, stored);
  return { valid: false, needsRehash: false };
}

export function verifyPassword(password: string, stored: string) {
  return verifyPasswordVersioned(password, stored).valid;
}

const DUMMY_PASSWORD_HASH = [
  'scrypt',
  SCRYPT_VERSION,
  SCRYPT_COST,
  SCRYPT_BLOCK_SIZE,
  SCRYPT_PARALLELIZATION,
  Buffer.from('avantime-dummy-salt').toString('base64url'),
  scryptDigest('not-a-real-password', Buffer.from('avantime-dummy-salt')).toString('base64url'),
].join('$');

export function verifyPasswordAgainstDummy(password: string) {
  return verifyPasswordVersioned(password, DUMMY_PASSWORD_HASH).valid;
}
