import type { RequestPriority } from './requests-store';

const CATEGORIES = new Set(['1С', 'Интеграция', 'Agent+', 'AI', 'Инфраструктура', 'Другое']);
const PRIORITIES = new Set<RequestPriority>(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
const IDEMPOTENCY_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/u;

function plainText(value: unknown, maximumLength: number, name: string) {
  if (typeof value !== 'string') throw new Error(`REQUEST_${name}_REQUIRED`);
  const normalized = value
    .normalize('NFKC')
    .replace(/\r\n?/gu, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .trim();
  if (!normalized) throw new Error(`REQUEST_${name}_REQUIRED`);
  if (normalized.length > maximumLength) throw new Error(`REQUEST_${name}_TOO_LONG`);
  return normalized;
}

export function validateRequestCreationPayload(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('REQUEST_PAYLOAD_INVALID');
  }
  const input = body as Record<string, unknown>;
  const category = plainText(input.category, 50, 'CATEGORY');
  if (!CATEGORIES.has(category)) throw new Error('REQUEST_CATEGORY_INVALID');
  const priority = input.priority ?? 'NORMAL';
  if (typeof priority !== 'string' || !PRIORITIES.has(priority as RequestPriority)) {
    throw new Error('REQUEST_PRIORITY_INVALID');
  }
  return {
    title: plainText(input.title, 160, 'TITLE'),
    description: plainText(input.description, 5_000, 'DESCRIPTION'),
    category,
    priority: priority as RequestPriority,
  };
}

export function validateRequestIdempotencyKey(value: string | null) {
  if (!value || !IDEMPOTENCY_KEY.test(value)) throw new Error('REQUEST_IDEMPOTENCY_KEY_INVALID');
  return value;
}
