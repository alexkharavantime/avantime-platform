import { createHash } from 'node:crypto';

import { getPrisma } from '@avantime/database';

import {
  NotificationProviderError,
  type NotificationDelivery,
  type NotificationOutboxRecord,
  type NotificationProviderAdapter,
} from './notification-outbox';

const SAFE_PROVIDER_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,199}$/u;

export class TestNotificationProvider implements NotificationProviderAdapter {
  readonly kind = 'test' as const;
  private readonly receipts = new Map<string, NotificationDelivery>();

  constructor(private readonly failFirstAttempts = 0) {}

  async checkReadiness() {
    return true;
  }

  async deliver(record: NotificationOutboxRecord) {
    const previous = this.receipts.get(record.idempotencyKey);
    if (previous) return previous;
    if (record.attempts <= this.failFirstAttempts) {
      throw new NotificationProviderError('TEST_PROVIDER_REJECTED');
    }
    const receipt = {
      providerMessageId: `test:${createHash('sha256').update(record.idempotencyKey).digest('hex')}`,
      terminal: 'delivered' as const,
    };
    this.receipts.set(record.idempotencyKey, receipt);
    return receipt;
  }
}

export class ResendNotificationProvider implements NotificationProviderAdapter {
  readonly kind = 'resend' as const;

  constructor(
    private readonly configuration: {
      apiKey: string;
      senderIdentity: string;
      applicationBaseUrl: string;
      endpoint?: string;
    },
  ) {}

  async checkReadiness() {
    return Boolean(
      this.configuration.apiKey.length >= 20 &&
      this.configuration.senderIdentity &&
      new URL(this.configuration.applicationBaseUrl),
    );
  }

  async deliver(record: NotificationOutboxRecord) {
    if (!record.recipientUserId) throw new NotificationProviderError('RECIPIENT_REFERENCE_MISSING');
    const prisma = await getPrisma();
    if (!prisma) throw new NotificationProviderError('RECIPIENT_DATABASE_UNAVAILABLE');
    const user = await prisma.user.findUnique({
      where: { id: record.recipientUserId },
      select: { email: true, active: true, disabledAt: true },
    });
    if (!user?.active || user.disabledAt || !user.email) {
      throw new NotificationProviderError('RECIPIENT_UNAVAILABLE');
    }
    const endpoint = this.configuration.endpoint ?? 'https://api.resend.com/emails';
    if (record.providerMessageId) {
      const receipt = await fetch(`${endpoint}/${encodeURIComponent(record.providerMessageId)}`, {
        headers: { Authorization: `Bearer ${this.configuration.apiKey}` },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (!receipt.ok) throw new NotificationProviderError('PROVIDER_RECEIPT_UNAVAILABLE');
      const body = (await receipt.json().catch(() => null)) as { last_event?: unknown } | null;
      return {
        providerMessageId: record.providerMessageId,
        terminal: body?.last_event === 'delivered' ? ('delivered' as const) : ('accepted' as const),
      };
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.configuration.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': record.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.configuration.senderIdentity,
        to: [user.email],
        subject: 'Уведомление безопасности Avantime',
        text: `В Avantime доступно новое уведомление. Откройте ${new URL('/portal/notifications', this.configuration.applicationBaseUrl).toString()}`,
        headers: { 'X-Avantime-Correlation-Id': record.correlationId },
        tags: [{ name: 'template', value: record.templateReference }],
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new NotificationProviderError('PROVIDER_REJECTED');
    const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
    if (typeof body?.id !== 'string' || !SAFE_PROVIDER_ID.test(body.id)) {
      throw new NotificationProviderError('PROVIDER_RECEIPT_INVALID');
    }
    return { providerMessageId: body.id, terminal: 'accepted' as const };
  }
}

export function createNotificationProvider(
  environment: Record<string, string | undefined> = process.env,
): NotificationProviderAdapter {
  const mode = environment.NOTIFICATION_PROVIDER_MODE;
  if (mode === 'test') {
    if (environment.STAGING_MODE !== 'local' && environment.NODE_ENV !== 'test') {
      throw new Error('TEST_NOTIFICATION_PROVIDER_DENIED');
    }
    return new TestNotificationProvider();
  }
  if (mode === 'resend') {
    if (!environment.RESEND_API_KEY || !environment.NOTIFICATION_SENDER_IDENTITY) {
      throw new Error('RESEND_NOTIFICATION_PROVIDER_INCOMPLETE');
    }
    return new ResendNotificationProvider({
      apiKey: environment.RESEND_API_KEY,
      senderIdentity: environment.NOTIFICATION_SENDER_IDENTITY,
      applicationBaseUrl: environment.APP_BASE_URL ?? '',
    });
  }
  throw new Error('NOTIFICATION_PROVIDER_NOT_CONFIGURED');
}
