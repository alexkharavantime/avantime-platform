import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

import { encryptTotpSecret, generateTotpSecret, totpAtCounter } from '../../lib/mfa';
import {
  BROWSER_BASE_URL,
  BROWSER_DATABASE_URL,
  browserIdentities,
  browserServerEnvironment,
} from './environment';
import { expect, test } from './fixtures';

const prisma = new PrismaClient({ datasourceUrl: BROWSER_DATABASE_URL });
let originalIdentityPolicy: {
  mfaRequirement: 'OPTIONAL' | 'ADMINS' | 'ALL_MEMBERS';
  gracePeriodDays: number;
  enforcementAt: Date | null;
} | null = null;

test.beforeEach(async () => {
  originalIdentityPolicy = await prisma.organizationIdentityPolicy.findUnique({
    where: { companyId: browserIdentities.identityAdmin.companyId },
    select: { mfaRequirement: true, gracePeriodDays: true, enforcementAt: true },
  });
});

test.afterEach(async () => {
  await prisma.mfaMethod.deleteMany({
    where: {
      userId: 'browser-identity-admin',
      label: 'Isolated browser test authenticator',
    },
  });
  await prisma.userSession.deleteMany({ where: { userId: 'browser-identity-admin' } });
  await prisma.platformRoleAssignment.deleteMany({
    where: { id: 'browser-platform-identity-admin-assignment' },
  });
  if (originalIdentityPolicy) {
    await prisma.organizationIdentityPolicy.update({
      where: { companyId: browserIdentities.identityAdmin.companyId },
      data: originalIdentityPolicy,
    });
  } else {
    await prisma.organizationIdentityPolicy.deleteMany({
      where: { companyId: browserIdentities.identityAdmin.companyId },
    });
  }
  originalIdentityPolicy = null;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('password plus TOTP reaches the protected localized queue and keeps its host-only session on reload', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const identity = browserIdentities.identityAdmin;
  const companyId = identity.companyId;
  const now = new Date();
  const totpSecret = generateTotpSecret();
  await prisma.organizationIdentityPolicy.upsert({
    where: { companyId },
    create: {
      companyId,
      mfaRequirement: 'ADMINS',
      gracePeriodDays: 0,
      enforcementAt: new Date(now.getTime() - 60_000),
    },
    update: {
      mfaRequirement: 'ADMINS',
      gracePeriodDays: 0,
      enforcementAt: new Date(now.getTime() - 60_000),
    },
  });
  await prisma.platformRoleAssignment.create({
    data: {
      id: 'browser-platform-identity-admin-assignment',
      userId: 'browser-identity-admin',
      role: 'PLATFORM_ADMIN',
      active: true,
      version: 1,
    },
  });
  await prisma.mfaMethod.create({
    data: {
      userId: 'browser-identity-admin',
      kind: 'TOTP',
      status: 'ACTIVE',
      label: 'Isolated browser test authenticator',
      secretEncrypted: encryptTotpSecret(totpSecret, browserServerEnvironment),
      confirmedAt: now,
    },
  });

  const suffix = randomUUID();
  const approvalEmail = `queue-approve-${suffix}@example.test`;
  const rejectionEmail = `queue-reject-${suffix}@example.test`;
  const unverifiedEmail = `queue-pending-${suffix}@example.test`;
  await prisma.accessRequest.createMany({
    data: [
      {
        name: 'Synthetic Approval Applicant',
        email: approvalEmail,
        emailNormalized: approvalEmail,
        companyName: 'Synthetic Company Alpha',
        status: 'EMAIL_VERIFIED',
        emailVerifiedAt: now,
        locale: 'ru',
      },
      {
        name: 'Synthetic Rejection Applicant',
        email: rejectionEmail,
        emailNormalized: rejectionEmail,
        companyName: 'Synthetic Company Beta',
        status: 'EMAIL_VERIFIED',
        emailVerifiedAt: now,
        locale: 'ru',
      },
      {
        name: 'Synthetic Pending Applicant',
        email: unverifiedEmail,
        emailNormalized: unverifiedEmail,
        companyName: 'Synthetic Company Gamma',
        status: 'PENDING',
        locale: 'ru',
      },
    ],
  });

  await page.goto('/ru/portal/platform/access-requests');
  await expect(page).toHaveURL(/\/ru\/portal\/login\?/u);
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(
    '/ru/portal/platform/access-requests',
  );
  await page.locator('input[type="email"]').fill(identity.email);
  await page.locator('input[type="password"]').fill(identity.password);
  const loginResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/login' &&
      response.request().method() === 'POST',
  );
  const loginRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/api/auth/login' && request.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Войти' }).click();
  const [response, request] = await Promise.all([loginResponse, loginRequest]);
  const requestHeaders = await request.allHeaders();
  expect({
    documentOrigin: new URL(page.url()).origin,
    requestOrigin: requestHeaders.origin,
    configuredOrigin: browserServerEnvironment.AUTH_PUBLIC_ORIGIN,
  }).toEqual({
    documentOrigin: BROWSER_BASE_URL,
    requestOrigin: BROWSER_BASE_URL,
    configuredOrigin: BROWSER_BASE_URL,
  });
  const loginBody = (await response.json()) as {
    mfaRequired?: boolean;
    enrollmentRequired?: boolean;
  };
  expect(loginBody).toMatchObject({ mfaRequired: true, enrollmentRequired: false });

  await page.getByLabel('Код MFA или резервный код').fill(
    totpAtCounter(totpSecret, Math.floor(Date.now() / 30_000)),
  );
  const mfaResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/mfa/challenge' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  const mfaResponse = await mfaResponsePromise;
  expect(mfaResponse.status()).toBe(200);
  await expect(page).toHaveURL(/\/ru\/portal\/platform\/access-requests$/u);
  const sessionCookie = (await page.context().cookies(BROWSER_BASE_URL)).find(
    (cookie) => cookie.name === 'avantime_session',
  );
  expect(sessionCookie).toMatchObject({
    domain: new URL(BROWSER_BASE_URL).hostname,
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    secure: false,
  });

  await expect(page.getByRole('heading', { level: 1, name: 'Заявки на доступ' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Заявки на доступ' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'RU', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText('Подтверждение email заявителем').first()).toBeVisible();
  await expect(page.getByText('Решение администратора').first()).toBeVisible();

  await page.getByRole('link', { name: 'LV', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Piekļuves pieprasījumi' })).toBeVisible();
  await page.getByRole('link', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Access requests' })).toBeVisible();
  await page.getByRole('link', { name: 'RU', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Заявки на доступ' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Заявки на доступ' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('access-request-queue-ru.png'), fullPage: true });

  const reviewSection = page.getByLabel('Ожидают рассмотрения');
  const approvalCard = reviewSection.locator('li').filter({ hasText: approvalEmail });
  await approvalCard.getByRole('combobox').first().selectOption(companyId);
  await approvalCard.getByRole('button', { name: 'Одобрить доступ' }).click();
  const approvalDialog = page.getByRole('dialog');
  await expect(approvalDialog).toBeVisible();
  await expect(approvalDialog).toContainText('Synthetic Approval Applicant');
  await expect(approvalDialog).toContainText('Browser Identity Tenant');
  const approveResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.includes('/decision') &&
      response.request().method() === 'POST',
  );
  await approvalDialog.getByRole('button', { name: 'Одобрить доступ' }).click();
  const approveResponse = await approveResponsePromise;
  expect(approveResponse.status()).toBe(200);
  expect(await approveResponse.json()).toMatchObject({
    status: 'APPROVED',
    invitationCreated: true,
    emailAccepted: false,
    emailDeliveryEnabled: false,
    emailDeliverySuppressed: true,
  });
  await expect(page.getByRole('status')).toContainText('Отправка email отключена');

  const rejectionCard = reviewSection.locator('li').filter({ hasText: rejectionEmail });
  await rejectionCard.getByRole('button', { name: 'Отклонить' }).click();
  const rejectionDialog = page.getByRole('dialog');
  await expect(rejectionDialog).toBeVisible();
  const confirmRejectButton = rejectionDialog.getByRole('button', {
    name: 'Отклонить заявку',
  });
  await expect(confirmRejectButton).toBeDisabled();
  await rejectionDialog
    .getByLabel('Причина отклонения')
    .fill('Synthetic test request; no real applicant.');
  const rejectResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.includes('/decision') &&
      response.request().method() === 'POST',
  );
  await confirmRejectButton.click();
  expect((await rejectResponsePromise).status()).toBe(200);

  const [approved, rejected] = await Promise.all([
    prisma.accessRequest.findFirst({
      where: { emailNormalized: approvalEmail },
      select: { status: true, decisionCompanyId: true, invitationId: true },
    }),
    prisma.accessRequest.findFirst({
      where: { emailNormalized: rejectionEmail },
      select: { status: true, rejectionReason: true },
    }),
  ]);
  expect(approved).toMatchObject({ status: 'APPROVED', decisionCompanyId: companyId });
  expect(approved?.invitationId).toBeTruthy();
  expect(rejected).toEqual({
    status: 'REJECTED',
    rejectionReason: 'Synthetic test request; no real applicant.',
  });
  await expect(page.getByRole('status')).toContainText('Запрос отклонён.');
  const [approvedId, rejectedId] = await Promise.all([
    prisma.accessRequest.findFirstOrThrow({ where: { emailNormalized: approvalEmail }, select: { id: true } }),
    prisma.accessRequest.findFirstOrThrow({ where: { emailNormalized: rejectionEmail }, select: { id: true } }),
  ]);
  for (const requestId of [approvedId.id, rejectedId.id]) {
    const resendResponse = await page.request.post(
      `/api/platform/access-requests/${requestId}/resend-verification`,
      { headers: { origin: BROWSER_BASE_URL } },
    );
    expect(resendResponse.status()).toBe(409);
  }
});

test('access request is persisted, verified once and decided only by platform admin', async ({
  page,
  loginAs,
}, testInfo) => {
  const suffix = randomUUID();
  const applicantName = 'Automated Browser Applicant';
  const email = `access-request-${suffix}@example.test`;

  for (const [locale, heading] of [
    ['lv', 'Pieprasīt piekļuvi'],
    ['ru', 'Запросить доступ'],
    ['en', 'Request access'],
  ]) {
    await page.goto(`/${locale}/portal/request-access`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }

  await page.goto('/ru/portal/request-access');
  await page.screenshot({ path: testInfo.outputPath('request-access-form.png'), fullPage: true });

  const invalidResponse = await page.request.post('/api/auth/access-request', {
    headers: { origin: BROWSER_BASE_URL },
    data: { name: 'X', email, companyName: 'A' },
  });
  expect(invalidResponse.status()).toBe(200);
  expect(await prisma.accessRequest.count({ where: { emailNormalized: email } })).toBe(0);

  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/ru/portal/request-access');
    await page.getByLabel('Имя и фамилия').fill(applicantName);
    await page.getByLabel('Электронная почта').fill(email);
    await page.getByLabel('Компания').fill('Synthetic Test Company');
    await page.getByLabel('Комментарий (необязательно)').fill('Browser integration test only.');
    const responsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/auth/access-request' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Отправить запрос' }).click();
    expect((await responsePromise).status()).toBe(200);
    await expect(page.getByRole('status')).toContainText('Не создавайте дубликат');
  }

  const requests = await prisma.accessRequest.findMany({
    where: { emailNormalized: email },
    select: { id: true, status: true },
  });
  expect(requests).toHaveLength(2);
  const pending = requests.find((request) => request.status === 'PENDING');
  expect(requests.some((request) => request.status === 'REJECTED')).toBe(true);
  expect(pending).toBeDefined();
  if (!pending) throw new Error('The newest access request was not persisted.');
  const superseded = requests.find((request) => request.status === 'REJECTED');
  expect(superseded).toBeDefined();
  if (!superseded) throw new Error('The superseded synthetic request was not retained.');

  await page.goto('/ru/portal/platform/access-requests');
  await expect(page).toHaveURL(/\/portal\/login/u);
  expect((await page.request.get('/api/platform/access-requests')).status()).toBe(401);
  await loginAs('admin');
  const supersededResend = await page.request.post(
    `/api/platform/access-requests/${superseded.id}/resend-verification`,
    { headers: { origin: BROWSER_BASE_URL } },
  );
  expect(supersededResend.status()).toBe(409);
  await page.goto('/ru/portal/platform/access-requests');
  await expect(page.getByRole('link', { name: 'Заявки на доступ' }).first()).toBeVisible();
  const pendingCard = page
    .locator('li')
    .filter({ hasText: email })
    .filter({ hasText: 'Ещё не принято' });
  await expect(pendingCard.getByText('Не подтверждён')).toBeVisible();
  await expect(pendingCard.getByText('Ещё не принято')).toBeVisible();
  await expect(pendingCard.getByText('Дата заявки')).toBeVisible();
  await expect(pendingCard.getByText('Browser integration test only.')).toBeVisible();
    await expect(pendingCard.getByRole('button', { name: 'Повторно отправить подтверждение' })).toBeVisible();
    const unverifiedDecision = await page.request.post(
      `/api/platform/access-requests/${pending.id}/decision`,
      { headers: { origin: BROWSER_BASE_URL }, data: { action: 'reject', reason: 'Synthetic test.' } },
    );
    expect(unverifiedDecision.status()).toBe(409);

    const originalVerificationToken = randomBytes(32).toString('base64url');
    await prisma.accessRequest.update({
      where: { id: pending.id },
      data: {
        verificationTokenHash: createHash('sha256').update(originalVerificationToken).digest('hex'),
        verificationExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    const beforeResend = await prisma.accessRequest.findUniqueOrThrow({
      where: { id: pending.id },
      select: { id: true, email: true, status: true, verificationTokenHash: true },
    });
    const resendPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/platform/access-requests/${pending.id}/resend-verification` &&
        response.request().method() === 'POST',
    );
    await pendingCard.getByRole('button', { name: 'Повторно отправить подтверждение' }).click();
    const resendResponse = await resendPromise;
    expect(resendResponse.status()).toBe(200);
    expect(await resendResponse.json()).toEqual({ deliveryStatus: 'disabled' });
    await expect(
      page.getByRole('alert').filter({ hasText: 'Отправка email отключена' }),
    ).toContainText('Отправка email отключена');
    const afterResend = await prisma.accessRequest.findUniqueOrThrow({
      where: { id: pending.id },
      select: {
        id: true,
        email: true,
        status: true,
        emailVerifiedAt: true,
        verificationTokenHash: true,
        verificationExpiresAt: true,
      },
    });
    expect(afterResend).toMatchObject({
      id: beforeResend.id,
      email: beforeResend.email,
      status: 'PENDING',
      emailVerifiedAt: null,
    });
    expect(afterResend.verificationTokenHash).not.toBe(beforeResend.verificationTokenHash);
    expect(afterResend.verificationExpiresAt?.getTime()).toBeGreaterThan(Date.now());
    expect(await prisma.accessRequest.count({ where: { emailNormalized: email } })).toBe(2);
    const obsoleteVerification = await page.request.post('/api/auth/access-request/verify', {
      headers: { origin: BROWSER_BASE_URL },
      data: { token: originalVerificationToken },
    });
    expect(obsoleteVerification.status()).toBe(400);

    const simultaneousResends = await Promise.all([
      page.request.post(`/api/platform/access-requests/${pending.id}/resend-verification`, {
        headers: { origin: BROWSER_BASE_URL },
        data: { email: 'attacker@example.test' },
      }),
      page.request.post(`/api/platform/access-requests/${pending.id}/resend-verification`, {
        headers: { origin: BROWSER_BASE_URL },
      }),
    ]);
    expect(simultaneousResends.every((response) => [200, 409].includes(response.status()))).toBe(true);
    expect(simultaneousResends.some((response) => response.status() === 200)).toBe(true);
    expect(
      await prisma.accessRequest.findUniqueOrThrow({
        where: { id: pending.id },
        select: { email: true },
      }),
    ).toEqual({ email });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.request.post(`/api/platform/access-requests/${pending.id}/resend-verification`, {
        headers: { origin: BROWSER_BASE_URL },
      });
    }
    const rateLimitedResend = await page.request.post(
      `/api/platform/access-requests/${pending.id}/resend-verification`,
      { headers: { origin: BROWSER_BASE_URL } },
    );
    expect(rateLimitedResend.status()).toBe(429);

    const expiredVerificationToken = randomBytes(32).toString('base64url');
    await prisma.accessRequest.update({
      where: { id: pending.id },
      data: {
        verificationTokenHash: createHash('sha256').update(expiredVerificationToken).digest('hex'),
        verificationExpiresAt: new Date(Date.now() - 1_000),
      },
    });
    const expiredVerification = await page.request.post('/api/auth/access-request/verify', {
      headers: { origin: BROWSER_BASE_URL },
      data: { token: expiredVerificationToken },
    });
    expect(expiredVerification.status()).toBe(400);
    expect(
      await prisma.accessRequest.findUniqueOrThrow({
        where: { id: pending.id },
        select: { status: true, emailVerifiedAt: true },
      }),
    ).toEqual({ status: 'PENDING', emailVerifiedAt: null });
  await page.context().clearCookies();

  const verificationToken = randomBytes(32).toString('base64url');
  await prisma.accessRequest.update({
    where: { id: pending.id },
    data: {
      verificationTokenHash: createHash('sha256').update(verificationToken).digest('hex'),
      verificationExpiresAt: new Date(Date.now() + 60_000),
    },
  });
  await page.goto(`/ru/portal/request-access/verify?token=${verificationToken}`);
  await expect(page.getByRole('status')).toContainText(/адрес электронной почты подтверждён/iu);
  await expect
    .poll(async () => {
      const request = await prisma.accessRequest.findUnique({
        where: { id: pending.id },
        select: { status: true, verificationTokenHash: true },
      });
      return request;
    })
    .toEqual({ status: 'EMAIL_VERIFIED', verificationTokenHash: null });
  await page.screenshot({ path: testInfo.outputPath('request-email-verified.png'), fullPage: true });
  const replayedVerification = await page.request.post('/api/auth/access-request/verify', {
    headers: { origin: BROWSER_BASE_URL },
    data: { token: verificationToken },
  });
  expect(replayedVerification.status()).toBe(400);
  expect(
    await prisma.accessRequest.findUniqueOrThrow({
      where: { id: pending.id },
      select: { status: true, decisionCompanyId: true, decisionRole: true, invitationId: true },
    }),
  ).toEqual({
    status: 'EMAIL_VERIFIED',
    decisionCompanyId: null,
    decisionRole: null,
    invitationId: null,
  });

  await loginAs('tenantA');
  const clientQueueResponse = await page.request.get('/api/platform/access-requests');
  expect(clientQueueResponse.status()).toBe(403);
  const clientDecisionResponse = await page.request.post(
    `/api/platform/access-requests/${pending.id}/decision`,
    { headers: { origin: BROWSER_BASE_URL }, data: { action: 'reject' } },
  );
  expect(clientDecisionResponse.status()).toBe(403);
  const clientResendResponse = await page.request.post(
    `/api/platform/access-requests/${pending.id}/resend-verification`,
    { headers: { origin: BROWSER_BASE_URL } },
  );
  expect(clientResendResponse.status()).toBe(403);
  await page.goto('/ru/portal/platform/access-requests');
  await expect(page).toHaveURL(/\/portal$/u);

  await page.context().clearCookies();
  await loginAs('admin');
  await page.goto('/ru/portal/platform/access-requests');
  const reviewSection = page.getByLabel('Ожидают рассмотрения');
  const applicantCard = reviewSection.locator('li').filter({ hasText: email });
  await expect(applicantCard.getByText(email, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('access-request-admin-queue.png'), fullPage: true });
  await applicantCard.getByRole('combobox').first().selectOption({ label: 'Browser Tenant Alpha' });
  await applicantCard.getByRole('combobox').nth(1).selectOption('MEMBER');
  await applicantCard.getByRole('button', { name: 'Одобрить доступ' }).click();
  const approvalDialog = page.getByRole('dialog');
  await expect(approvalDialog).toBeVisible();
  await expect(approvalDialog).toContainText(email);
  await expect(approvalDialog).toContainText('Browser Tenant Alpha');
  const decisionPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/platform/access-requests/${pending.id}/decision` &&
      response.request().method() === 'POST',
  );
  await approvalDialog.getByRole('button', { name: 'Одобрить доступ' }).click();
  const decisionResponse = await decisionPromise;
  expect(decisionResponse.status()).toBe(200);
  expect(await decisionResponse.json()).toMatchObject({
    status: 'APPROVED',
    invitationCreated: true,
    emailAccepted: false,
    emailDeliveryConfirmed: false,
  });
  await expect(page.getByRole('status')).toContainText('приглашение создано');
  await expect(page.getByRole('status')).toContainText('Почтовый сервис не принял письмо к отправке');
  await expect(page.getByRole('status')).toContainText('Доставка не подтверждена.');
  await expect(page.getByRole('status')).toContainText('Отправка email отключена.');

  const approved = await prisma.accessRequest.findUnique({
    where: { id: pending.id },
    select: { status: true, decisionCompanyId: true, invitationId: true },
  });
  expect(approved).toMatchObject({
    status: 'APPROVED',
    decisionCompanyId: 'browser-tenant-a',
  });
  expect(approved?.invitationId).toBeTruthy();
});

test('approved access request invitation activates a new user and grants the selected company access', async ({
  page,
}, testInfo) => {
  const suffix = randomUUID();
  const email = `activation-${suffix}@example.test`;
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const invitation = await prisma.identityInvitation.create({
    data: {
      tokenHash: createHash('sha256').update(token).digest('hex'),
      companyId: 'browser-tenant-a',
      emailNormalized: email,
      role: 'CLIENT',
      organizationRole: 'MEMBER',
      invitedBy: 'browser-admin',
      expiresAt: new Date(now.getTime() + 60 * 60_000),
    },
  });
  await prisma.accessRequest.create({
    data: {
      name: 'New Portal Applicant',
      email,
      emailNormalized: email,
      companyName: 'Synthetic Test Company',
      status: 'APPROVED',
      emailVerifiedAt: now,
      decidedById: 'browser-admin',
      decidedAt: now,
      decisionCompanyId: 'browser-tenant-a',
      decisionRole: 'MEMBER',
      invitationId: invitation.id,
    },
  });

  await page.goto(`/ru/portal/accept-invitation?token=${token}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Активировать учётную запись' })).toBeVisible();
  const password = 'F!rstLogin-Vault-2026';
  await page.getByLabel('Новый пароль').fill(password);
  await page.getByLabel('Повторите пароль').fill(password);
  const activationResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/invitation/accept' &&
      response.request().method() === 'POST',
  );
  await page.locator('form').getByRole('button').click();
  expect((await activationResponse).status()).toBe(200);
  await expect(page.getByRole('status')).toContainText('Учётная запись активирована');
  await page.screenshot({ path: testInfo.outputPath('access-invitation-activated.png'), fullPage: true });

  const activated = await prisma.user.findFirst({
    where: { emailNormalized: email },
    include: { credentials: true, memberships: true },
  });
  expect(activated?.emailVerifiedAt).toBeTruthy();
  expect(activated?.credentials).toHaveLength(1);
  expect(activated?.memberships).toMatchObject([
    { companyId: 'browser-tenant-a', organizationRole: 'MEMBER', status: 'ACTIVE', active: true },
  ]);

  await page.goto('/ru/portal/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  const loginResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/login' &&
      response.request().method() === 'POST',
  );
  await page.locator('form').getByRole('button').last().click();
  expect((await loginResponse).status()).toBe(200);
  await expect(page.getByText('Загрузка кабинета…')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: /Добрый день/u })).toBeVisible({
    timeout: 30_000,
  });
});

test('portal login session survives reload and logout revokes it', async ({ page, loginAs }, testInfo) => {
  await loginAs('tenantA');
  await page.goto('/portal');
  await expect(page.getByRole('heading', { level: 1, name: /Good day/u })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /Good day/u })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('portal-session.png'), fullPage: true });

  await page.goto('/portal/settings');
  await page.getByRole('button', { name: 'Sign out of portal' }).click();
  await expect(page).toHaveURL(/\/portal\/login/u);
  await page.goto('/portal');
  await expect(page).toHaveURL(/\/portal\/login/u);
});

test('contacts form validates and confirms its documented demo-only behavior', async ({
  page,
}, testInfo) => {
  const postRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') postRequests.push(new URL(request.url()).pathname);
  });
  await page.goto('/ru/contacts');
  await page.locator('input[name="name"]').fill('Synthetic Contact');
  await page.locator('input[name="contact"]').fill('contact@example.test');
  await page.locator('textarea[name="task"]').fill('short');
  await page.locator('form').getByRole('button').click();
  await expect(page.locator('textarea[name="task"]')).toHaveAttribute('aria-invalid', 'true');

  await page.locator('textarea[name="task"]').fill('Synthetic browser contact test with enough detail.');
  await page.screenshot({ path: testInfo.outputPath('contacts-form.png'), fullPage: true });
  await page.locator('form').getByRole('button').click();
  await expect(page.locator('form')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 3 })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('contacts-demo-confirmation.png'), fullPage: true });
  expect(postRequests).toEqual([]);
});

test('verified email change preserves identity and platform role relationships', async ({
  page,
  loginAs,
}) => {
  const ownerId = 'browser-identity-owner';
  const nextEmail = `owner-${randomUUID()}@example.test`;
  await loginAs('identityOwner');
  const ownerBefore = await prisma.user.findUniqueOrThrow({
    where: { id: ownerId },
    select: {
      id: true,
      role: true,
      platformRoleAssignments: { select: { id: true, role: true, active: true } },
      memberships: {
        select: { id: true, companyId: true, organizationRole: true, status: true, active: true },
      },
    },
  });
  const sessionsBefore = await prisma.userSession.findMany({
    where: { userId: ownerId, revokedAt: null },
    select: { id: true },
  });
  expect(sessionsBefore.length).toBeGreaterThan(0);

  await page.goto('/ru/portal/settings/security');
  await page.getByLabel('Новая электронная почта').fill(nextEmail);
  const requestPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/account/security/email-change' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Отправить ссылку подтверждения' }).click();
  const requestResponse = await requestPromise;
  expect(requestResponse.status()).toBe(200);
  const requestBody = (await requestResponse.json()) as {
    emailAccepted: boolean;
    emailDeliveryConfirmed: boolean;
    verificationToken?: string;
  };
  expect(requestBody.emailAccepted).toBe(false);
  expect(requestBody.emailDeliveryConfirmed).toBe(false);
  expect(requestBody.verificationToken).toBeTruthy();
  const pendingVerification = await prisma.emailChangeVerification.findFirst({
    where: { userId: ownerId, usedAt: null },
    select: { tokenHash: true, expiresAt: true, emailNormalized: true },
  });
  expect(
    Boolean(
      pendingVerification &&
        requestBody.verificationToken &&
        pendingVerification.tokenHash ===
          createHash('sha256').update(requestBody.verificationToken).digest('hex') &&
        pendingVerification.expiresAt > new Date() &&
        pendingVerification.emailNormalized === nextEmail,
    ),
  ).toBe(true);
  expect(
    (await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { email: true } })).email,
  ).toBe(browserIdentities.identityOwner.email);

  await page.goto(`/ru/portal/settings/security/confirm-email-change?token=${requestBody.verificationToken}`);
  const confirmPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/email-change/verify' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Подтвердить новый email' }).click();
  const confirmResponse = await confirmPromise;
  const confirmBody = (await confirmResponse.json()) as Record<string, unknown>;
  expect(confirmResponse.status(), JSON.stringify(confirmBody)).toBe(200);
  await expect(page.getByRole('status')).toContainText('Email изменён');

  const ownerAfter = await prisma.user.findUniqueOrThrow({
    where: { id: ownerId },
    select: {
      id: true,
      email: true,
      emailNormalized: true,
      emailVerifiedAt: true,
      role: true,
      platformRoleAssignments: { select: { id: true, role: true, active: true } },
      memberships: {
        select: { id: true, companyId: true, organizationRole: true, status: true, active: true },
      },
      credentials: { select: { identifierNormalized: true } },
    },
  });
  expect(ownerAfter).toMatchObject({
    id: ownerBefore.id,
    email: nextEmail,
    emailNormalized: nextEmail,
    emailVerifiedAt: expect.any(Date),
    role: ownerBefore.role,
    platformRoleAssignments: ownerBefore.platformRoleAssignments,
    memberships: ownerBefore.memberships,
    credentials: [{ identifierNormalized: nextEmail }],
  });
  const sessionsAfter = await prisma.userSession.count({
    where: { userId: ownerId, revokedAt: null },
  });
  expect(sessionsAfter).toBe(0);

  await page.context().clearCookies();
  await page.goto('/ru/portal/login');
  await page.locator('input[type="email"]').fill(nextEmail);
  await page.locator('input[type="password"]').fill(browserIdentities.identityOwner.password);
  const loginPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/login' &&
      response.request().method() === 'POST',
  );
  await page.locator('form').getByRole('button').last().click();
  expect((await loginPromise).status()).toBe(200);
});