import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAccessRequestVerificationUrl } from '../lib/access-requests';
import { sendIdentityEmail } from '../lib/identity-email';

const configuredMailEnvironment = {
  NODE_ENV: 'production',
  IDENTITY_EMAIL_DRIVER: 'resend',
  RESEND_API_KEY: 'synthetic-test-key-not-a-secret',
  MAIL_FROM: 'Avantime <no-reply@example.test>',
};

test('access request verification URL uses the configured origin and saved locale', () => {
  const originalEnvironment = {
    IDENTITY_PUBLIC_BASE_URL: process.env.IDENTITY_PUBLIC_BASE_URL,
  };
  process.env.IDENTITY_PUBLIC_BASE_URL = 'https://portal.example.test';
  try {
    assert.equal(
      buildAccessRequestVerificationUrl('synthetic-token', 'ru', 'https://internal.example.test'),
      'https://portal.example.test/ru/portal/request-access/verify?token=synthetic-token',
    );
  } finally {
    if (originalEnvironment.IDENTITY_PUBLIC_BASE_URL === undefined) {
      delete process.env.IDENTITY_PUBLIC_BASE_URL;
    } else {
      process.env.IDENTITY_PUBLIC_BASE_URL = originalEnvironment.IDENTITY_PUBLIC_BASE_URL;
    }
  }
});

test('configured mail transport reports provider acceptance without claiming delivery', async () => {
  let sentMessage: Record<string, unknown> | undefined;
  const result = await sendIdentityEmail(
    {
      kind: 'ACCESS_REQUEST_VERIFICATION',
      recipient: 'synthetic-applicant@example.test',
      code: 'https://portal.example.test/lv/portal/request-access/verify?token=synthetic-token',
      locale: 'lv',
    },
    {
      environment: configuredMailEnvironment,
      fetch: async (_input, init) => {
        sentMessage = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response('{}', { status: 202 });
      },
    },
  );

  assert.deepEqual(result, {
    accepted: true,
    deliveryConfirmed: false,
    suppressed: false,
  });
  assert.deepEqual(sentMessage?.to, ['synthetic-applicant@example.test']);
  assert.equal(sentMessage?.subject, 'Apstipriniet pieteikumu Avantime portāla piekļuvei');
  assert.match(String(sentMessage?.text), /lv\/portal\/request-access\/verify\?token=synthetic-token/u);
});

test('disabled mail transport is reported as suppressed and does not call the provider', async () => {
  let providerCalled = false;
  const result = await sendIdentityEmail(
    {
      kind: 'ACCESS_REQUEST_VERIFICATION',
      recipient: 'synthetic-applicant@example.test',
      code: 'https://portal.example.test/en/portal/request-access/verify?token=synthetic-token',
      locale: 'en',
    },
    {
      environment: { NODE_ENV: 'development' },
      fetch: async () => {
        providerCalled = true;
        return new Response('{}');
      },
    },
  );

  assert.deepEqual(result, {
    accepted: false,
    deliveryConfirmed: false,
    suppressed: true,
  });
  assert.equal(providerCalled, false);
});

test('mail transport rejection is distinct and does not expose provider response details', async () => {
  await assert.rejects(
    () =>
      sendIdentityEmail(
        {
          kind: 'ACCESS_REQUEST_VERIFICATION',
          recipient: 'synthetic-applicant@example.test',
          code: 'https://portal.example.test/en/portal/request-access/verify?token=synthetic-token',
          locale: 'en',
        },
        {
          environment: configuredMailEnvironment,
          fetch: async () => new Response('sensitive provider diagnostic', { status: 503 }),
        },
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'Identity email provider rejected the request.' &&
      !error.message.includes('sensitive'),
  );
});