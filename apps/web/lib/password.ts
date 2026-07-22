import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const ITERATIONS = 210_000;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const digest = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256').toString('hex');
  return `pbkdf2$${ITERATIONS}$${salt}$${digest}`;
}

export function verifyPassword(password: string, stored: string) {
  const [algorithm, iterationsText, salt, digest] = stored.split('$');
  if (algorithm !== 'pbkdf2' || !iterationsText || !salt || !digest) return false;
  const calculated = pbkdf2Sync(password, salt, Number(iterationsText), 32, 'sha256');
  const expected = Buffer.from(digest, 'hex');
  return calculated.length === expected.length && timingSafeEqual(calculated, expected);
}
