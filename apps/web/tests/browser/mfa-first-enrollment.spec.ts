import { PrismaClient } from '@prisma/client';

import { totpAtCounter } from '../../lib/mfa';
import { verifyPasswordVersioned } from '../../lib/password';
import { BROWSER_DATABASE_URL, browserIdentities } from './environment';
import { expect, test } from './fixtures';

const prisma = new PrismaClient({ datasourceUrl: BROWSER_DATABASE_URL });
const companyId = browserIdentities.identityAdmin.companyId;
let originalPolicy: {
  mfaRequirement: 'OPTIONAL' | 'ADMINS' | 'ALL_MEMBERS';
  gracePeriodDays: number;
  enforcementAt: Date | null;
} | null = null;

test.use({ screenshot: 'off', trace: 'off' });

test.describe('restricted first TOTP enrollment', () => {
  test.beforeAll(async () => {
    originalPolicy = await prisma.organizationIdentityPolicy.findUnique({
      where: { companyId },
      select: { mfaRequirement: true, gracePeriodDays: true, enforcementAt: true },
    });
    await prisma.organizationIdentityPolicy.upsert({
      where: { companyId },
      create: {
        companyId,
        mfaRequirement: 'ADMINS',
        gracePeriodDays: 0,
        enforcementAt: new Date(Date.now() - 60_000),
      },
      update: {
        mfaRequirement: 'ADMINS',
        gracePeriodDays: 0,
        enforcementAt: new Date(Date.now() - 60_000),
      },
    });
  });

  test.afterAll(async () => {
    if (originalPolicy) {
      await prisma.organizationIdentityPolicy.update({
        where: { companyId },
        data: originalPolicy,
      });
    } else {
      await prisma.organizationIdentityPolicy.deleteMany({ where: { companyId } });
    }
    await prisma.$disconnect();
  });

  test('shows QR, issues recovery codes, then requires TOTP for a full session', async ({ page }) => {
    test.setTimeout(120_000);
    const identity = browserIdentities.identityAdmin;
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(`${error.name}: ${error.message}`));

    await page.goto('/ru/portal/login');
    await page.locator('input[type="email"]').fill(identity.email);
    await page.locator('input[type="password"]').fill(identity.password);
    const enrollmentLogin = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/auth/login' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Войти' }).click();
    const enrollmentResult = (await (await enrollmentLogin).json()) as {
      mfaRequired?: boolean;
      enrollmentRequired?: boolean;
      challengeToken?: string;
    };
    expect(enrollmentResult.mfaRequired).toBe(true);
    expect(enrollmentResult.enrollmentRequired).toBe(true);
    expect(enrollmentResult.challengeToken).toBeUndefined();
    await page.getByRole('button', { name: 'Настроить приложение-аутентификатор' }).click();
    await expect(page).toHaveURL(/\/ru\/portal\/mfa-enrollment$/u);
    await page.waitForLoadState('networkidle');

    const accessBeforeConfirmation = await page.evaluate(async () =>
      (await fetch('/api/account/security', { cache: 'no-store' })).status,
    );
    expect(accessBeforeConfirmation).toBe(401);

    const enrollmentPath = '/api/account/security/mfa/totp/enroll';
    const failedEnrollmentRequest = new Promise<string>((resolve) => {
      page.on('requestfailed', (request) => {
        if (new URL(request.url()).pathname === enrollmentPath) {
          resolve(request.failure()?.errorText ?? 'request failed');
        }
      });
    });
    const isEnrollmentRequest = (request: import('@playwright/test').Request) =>
      new URL(request.url()).pathname === enrollmentPath && request.method() === 'POST';
    const enrollmentStarted = page.waitForRequest(isEnrollmentRequest, { timeout: 10_000 })
      .then(() => true, () => false);
    const enrollmentResponse = page.waitForResponse(
      (response) => isEnrollmentRequest(response.request()),
      { timeout: 15_000 },
    ).then(
      (response) => ({ status: response.status() }),
      () => ({ timeout: true as const }),
    );
    await page.getByRole('button', { name: 'Показать QR-код' }).click();
    const started = await enrollmentStarted;
    expect(
      started,
      pageErrors.join('\n') || 'Enrollment button did not dispatch its API request.',
    ).toBe(true);
    const enrollmentOutcome = await Promise.race([
      enrollmentResponse,
      failedEnrollmentRequest.then((error) => ({ error })),
    ]);
    expect(enrollmentOutcome).toEqual({ status: 201 });
    await expect(page.getByRole('img', { name: 'QR-код приложения-аутентификатора' })).toBeVisible();
    const secret = (await page.locator('details code').textContent())?.trim() ?? '';
    expect(/^[A-Z2-7]+$/u.test(secret)).toBe(true);

    const totpCode = totpAtCounter(secret, Math.floor(Date.now() / 30_000));
    await page.getByLabel('Код подтверждения').fill(totpCode);
    const confirmationResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/account/security/mfa/totp/confirm' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Подтвердить MFA' }).click();
    const confirmation = await confirmationResponse;
    expect(confirmation.ok()).toBe(true);
    const recoveryResult = (await confirmation.json()) as { recoveryCodes?: string[] };
    expect(recoveryResult.recoveryCodes?.length).toBe(10);
    await expect(page.getByTestId('mfa-recovery-codes').locator('li')).toHaveCount(10);
    expect(
      await page.evaluate(async () =>
        (await fetch('/api/account/security', { cache: 'no-store' })).status,
      ),
    ).toBe(401);

    await page.getByRole('button', { name: 'Перейти ко входу' }).click();
    await expect(page).toHaveURL(/\/ru\/portal\/login$/u);
    await page.waitForLoadState('networkidle');
    const credential = await prisma.userCredential.findUnique({
      where: { identifierNormalized: identity.email },
      select: { passwordHash: true },
    });
    expect(
      verifyPasswordVersioned(identity.password, credential?.passwordHash ?? '').valid,
    ).toBe(true);
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await emailInput.fill(identity.email);
    await passwordInput.fill(identity.password);
    const formValuesMatch = await page.evaluate(
      ({ email, password }) => ({
        emailMatches: document.querySelector<HTMLInputElement>('input[type="email"]')?.value === email,
        passwordMatches:
          document.querySelector<HTMLInputElement>('input[type="password"]')?.value === password,
      }),
      { email: identity.email, password: identity.password },
    );
    expect(formValuesMatch).toEqual({ emailMatches: true, passwordMatches: true });
    const mfaLoginRequest = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === '/api/auth/login' &&
        request.method() === 'POST',
    );
    const mfaLogin = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/auth/login' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Войти' }).click();
    const loginBody = JSON.parse((await mfaLoginRequest).postData() ?? '{}') as {
      email?: string;
      password?: string;
    };
    expect({
      keysAreAllowed: Object.keys(loginBody).every((key) =>
        ['email', 'password', 'returnTo'].includes(key),
      ),
      emailPresent: typeof loginBody.email === 'string',
      passwordPresent: typeof loginBody.password === 'string',
      emailMatches: loginBody.email === identity.email,
      passwordMatches: loginBody.password === identity.password,
    }).toEqual({
      keysAreAllowed: true,
      emailPresent: true,
      passwordPresent: true,
      emailMatches: true,
      passwordMatches: true,
    });
    const mfaLoginResponse = await mfaLogin;
    const challenge = (await mfaLoginResponse.json()) as {
      mfaRequired?: boolean;
      enrollmentRequired?: boolean;
      ok?: boolean;
      error?: string;
    };
    expect({
      status: mfaLoginResponse.status(),
      mfaRequired: challenge.mfaRequired,
      enrollmentRequired: challenge.enrollmentRequired,
      ok: challenge.ok,
      error: challenge.error,
    }).toEqual({
      status: 200,
      mfaRequired: true,
      enrollmentRequired: false,
      ok: undefined,
      error: undefined,
    });

    await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 500);
    await page.getByLabel('Код MFA или recovery code').fill(
      totpAtCounter(secret, Math.floor(Date.now() / 30_000)),
    );
    await page.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(page).toHaveURL(/\/(?:ru\/)?admin$/u);
    const securityStatus = await page.evaluate(async () => {
      const response = await fetch('/api/account/security', { cache: 'no-store' });
      if (!response.ok) return { status: response.status, mfaEnabled: false };
      const data = (await response.json()) as { mfa?: { enabled?: boolean } };
      return { status: response.status, mfaEnabled: data.mfa?.enabled === true };
    });
    expect(securityStatus).toEqual({ status: 200, mfaEnabled: true });

    const reEnrollmentStatus = await page.evaluate(async () =>
      (
        await fetch('/api/account/security/mfa/totp/enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      ).status,
    );
    expect(reEnrollmentStatus).toBe(409);
  });
});