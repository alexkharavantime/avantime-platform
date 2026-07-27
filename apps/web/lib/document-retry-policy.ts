import type { DocumentProcessingErrorClassification } from './document-processing-errors';

export type DocumentRetryPolicy = {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
};

export type DocumentRetryDecision =
  | {
      action: 'RETRY';
      nextRetryAt: string;
    }
  | {
      action: 'FAIL';
      nextRetryAt: null;
    }
  | {
      action: 'QUARANTINE';
      nextRetryAt: null;
    };

export const DEFAULT_DOCUMENT_RETRY_POLICY: DocumentRetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 1_000,
  maxDelayMs: 60_000,
};

function assertPositiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

export function validateDocumentRetryPolicy(policy: DocumentRetryPolicy) {
  assertPositiveInteger(policy.maxAttempts, 'DOCUMENT_PROCESSING_MAX_ATTEMPTS');
  assertPositiveInteger(policy.initialDelayMs, 'DOCUMENT_PROCESSING_INITIAL_RETRY_MS');
  assertPositiveInteger(policy.maxDelayMs, 'DOCUMENT_PROCESSING_MAX_RETRY_MS');
  if (policy.maxDelayMs < policy.initialDelayMs) {
    throw new Error(
      'DOCUMENT_PROCESSING_MAX_RETRY_MS must be greater than or equal to the initial delay.',
    );
  }

  return policy;
}

export function decideDocumentRetry(
  attempts: number,
  error: DocumentProcessingErrorClassification,
  policy: DocumentRetryPolicy,
  now = new Date(),
): DocumentRetryDecision {
  validateDocumentRetryPolicy(policy);
  assertPositiveInteger(attempts, 'processingAttempts');

  if (!error.retryable) {
    return {
      action: 'FAIL',
      nextRetryAt: null,
    };
  }
  if (attempts >= policy.maxAttempts) {
    return {
      action: 'QUARANTINE',
      nextRetryAt: null,
    };
  }

  const delay = Math.min(policy.initialDelayMs * 2 ** Math.max(0, attempts - 1), policy.maxDelayMs);
  return {
    action: 'RETRY',
    nextRetryAt: new Date(now.getTime() + delay).toISOString(),
  };
}
