const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,199}$/u;
const SENSITIVE_KEY =
  /(?:body|content|cookie|credential|email|header|password|recipient|secret|subject|token)/iu;

export const REQUIRED_GOVERNANCE_NOTIFICATION_EVENTS = [
  'bootstrap-completed',
  'role-changed',
  'support-started',
  'support-ended',
  'approval-requested',
  'approval-decided',
  'approval-expired',
  'knowledge-published',
  'knowledge-archived',
] as const;

export type GovernanceNotificationEvent = (typeof REQUIRED_GOVERNANCE_NOTIFICATION_EVENTS)[number];

export type GovernanceNotificationReceipt = {
  schemaVersion: 1;
  environment: 'staging';
  event: GovernanceNotificationEvent;
  correlationId: string;
  receiptId: string;
  provider: string;
  providerMessageId: string;
  recipientHash: string;
  templateId: string;
  status: 'delivered' | 'failed' | 'dead-lettered';
  attempts: number;
  attemptedAt: string;
  deliveredAt: string | null;
  failureCode: string | null;
  deadLetterVisible: boolean;
};

export type GovernanceNotificationValidationBundle = {
  schemaVersion: 1;
  deliveries: GovernanceNotificationReceipt[];
  failureObservation: GovernanceNotificationReceipt;
};

export function sanitizeNotificationProviderRecord(input: Record<string, unknown>) {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (
      SAFE_REFERENCE.test(key) &&
      (value === null || ['string', 'number', 'boolean'].includes(typeof value))
    ) {
      safe[key] = value as string | number | boolean | null;
    }
  }
  return safe;
}

export function validateGovernanceNotificationReceipt(receipt: GovernanceNotificationReceipt) {
  const allowedKeys = new Set([
    'schemaVersion',
    'environment',
    'event',
    'correlationId',
    'receiptId',
    'provider',
    'providerMessageId',
    'recipientHash',
    'templateId',
    'status',
    'attempts',
    'attemptedAt',
    'deliveredAt',
    'failureCode',
    'deadLetterVisible',
  ]);
  if (
    Object.keys(receipt).some((key) => !allowedKeys.has(key)) ||
    receipt.schemaVersion !== 1 ||
    receipt.environment !== 'staging' ||
    !REQUIRED_GOVERNANCE_NOTIFICATION_EVENTS.includes(receipt.event) ||
    ![
      receipt.correlationId,
      receipt.receiptId,
      receipt.provider,
      receipt.providerMessageId,
      receipt.templateId,
    ].every((value) => SAFE_REFERENCE.test(value)) ||
    !/^[a-f0-9]{64}$/u.test(receipt.recipientHash) ||
    !Number.isSafeInteger(receipt.attempts) ||
    receipt.attempts < 1 ||
    !Number.isFinite(Date.parse(receipt.attemptedAt)) ||
    (receipt.deliveredAt !== null && !Number.isFinite(Date.parse(receipt.deliveredAt))) ||
    (receipt.deliveredAt !== null &&
      new Date(receipt.deliveredAt) < new Date(receipt.attemptedAt)) ||
    (receipt.failureCode !== null && !SAFE_REFERENCE.test(receipt.failureCode))
  ) {
    throw new Error('GOVERNANCE_NOTIFICATION_RECEIPT_INVALID');
  }
  if (
    receipt.status !== 'delivered' ||
    receipt.deliveredAt === null ||
    receipt.failureCode !== null ||
    receipt.deadLetterVisible
  ) {
    throw new Error('GOVERNANCE_NOTIFICATION_NOT_DELIVERED');
  }
  return receipt;
}

export function validateGovernanceNotificationSet(receipts: GovernanceNotificationReceipt[]) {
  const validated = receipts.map(validateGovernanceNotificationReceipt);
  const events = new Set(validated.map((receipt) => receipt.event));
  if (new Set(validated.map((receipt) => receipt.correlationId)).size !== 1) {
    throw new Error('GOVERNANCE_NOTIFICATION_CORRELATION_MISMATCH');
  }
  const missing = REQUIRED_GOVERNANCE_NOTIFICATION_EVENTS.filter((event) => !events.has(event));
  if (missing.length > 0) throw new Error('GOVERNANCE_NOTIFICATION_SET_INCOMPLETE');
  if (new Set(validated.map((receipt) => receipt.providerMessageId)).size !== validated.length) {
    throw new Error('GOVERNANCE_NOTIFICATION_PROVIDER_ID_REUSED');
  }
  return validated;
}

export function validateGovernanceNotificationFailureObservation(
  receipt: GovernanceNotificationReceipt,
) {
  const delivered = receipt.status;
  const candidate = {
    ...receipt,
    status: 'delivered' as const,
    deliveredAt: receipt.attemptedAt,
    failureCode: null,
    deadLetterVisible: false,
  };
  validateGovernanceNotificationReceipt(candidate);
  if (
    !['failed', 'dead-lettered'].includes(delivered) ||
    receipt.attempts < 2 ||
    receipt.deliveredAt !== null ||
    receipt.failureCode === null ||
    receipt.deadLetterVisible !== true
  ) {
    throw new Error('GOVERNANCE_NOTIFICATION_FAILURE_NOT_VISIBLE');
  }
  return receipt;
}

export function validateGovernanceNotificationBundle(
  bundle: GovernanceNotificationValidationBundle,
) {
  if (
    bundle.schemaVersion !== 1 ||
    Object.keys(bundle).some(
      (key) => !['schemaVersion', 'deliveries', 'failureObservation'].includes(key),
    )
  ) {
    throw new Error('GOVERNANCE_NOTIFICATION_BUNDLE_INVALID');
  }
  return {
    deliveries: validateGovernanceNotificationSet(bundle.deliveries),
    failureObservation: validateGovernanceNotificationFailureObservation(bundle.failureObservation),
  };
}
