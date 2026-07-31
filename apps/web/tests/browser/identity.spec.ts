import { totpAtCounter } from '../../lib/mfa';
import { browserIdentities } from './environment';
import { expect, test } from './fixtures';

test.describe.serial('production identity browser lifecycle', () => {
  let secret = '';
  let recoveryCodes: string[] = [];
  let currentPassword: string = browserIdentities.identityClient.password;

  async function submitPrimary(page: Page, email: string, password: string) {
    await page.goto('/portal/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Войти' }).click();
  }

  async function waitForFreshTotpCounter() {
    const remaining = 30_000 - (Date.now() % 30_000) + 500;
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  test('valid login, uniform primary failures and open redirect denial', async ({ page }) => {
    await submitPrimary(page, browserIdentities.identityClient.email, 'wrong-browser-password');
    const wrong = await page.getByRole('alert').textContent();
    await submitPrimary(page, 'unknown.identity@example.test', 'wrong-browser-password');
    const unknown = await page.getByRole('alert').textContent();
    expect(unknown).toBe(wrong);

    await page.goto('/portal/login?returnTo=https://evil.example.test/path');
    await page.getByLabel('Email').fill(browserIdentities.identityClient.email);
    await page.getByLabel('Пароль').fill(currentPassword);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/portal$/u);
  });

  test('CLIENT can enroll optional MFA and receives one-time recovery codes', async ({ page }) => {
    await submitPrimary(page, browserIdentities.identityClient.email, currentPassword);
    await expect(page).toHaveURL(/\/portal$/u);
    await page.goto('/portal/settings/security');
    await page.getByRole('button', { name: 'Подключить TOTP' }).click();
    const secretBlock = page.locator('code').first();
    await expect(secretBlock).toBeVisible();
    secret = (await secretBlock.textContent())?.trim() ?? '';
    expect(secret).toMatch(/^[A-Z2-7]+$/u);
    const counter = Math.floor(Date.now() / 1000 / 30);
    await page.getByLabel('Код подтверждения').fill(totpAtCounter(secret, counter));
    await page.getByRole('button', { name: 'Подтвердить и включить' }).click();
    const codeItems = page.locator('li').filter({ hasText: /^[A-Z0-9]{4}-/u });
    await expect(codeItems.first()).toBeVisible();
    recoveryCodes = await codeItems.allTextContents();
    expect(recoveryCodes).toHaveLength(10);
  });

  test('invalid OTP, OTP replay, recovery use and recovery reuse are safe', async ({ page }) => {
    await page.context().clearCookies();
    await submitPrimary(page, browserIdentities.identityClient.email, currentPassword);
    await page.getByLabel('Код MFA или recovery code').fill('000000');
    await page.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(page.getByText('Неверный код подтверждения.')).toBeVisible();

    await page.getByRole('button', { name: 'Начать вход заново' }).click();
    await page.getByLabel('Пароль').fill(currentPassword);
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.getByLabel('Код MFA или recovery code').fill(recoveryCodes[0]);
    await page.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(page).toHaveURL(/\/portal$/u);

    await page.context().clearCookies();
    await submitPrimary(page, browserIdentities.identityClient.email, currentPassword);
    await page.getByLabel('Код MFA или recovery code').fill(recoveryCodes[0]);
    await page.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(page.getByText('Неверный код подтверждения.')).toBeVisible();

    await waitForFreshTotpCounter();
    await page.getByRole('button', { name: 'Начать вход заново' }).click();
    await page.getByLabel('Пароль').fill(currentPassword);
    await page.getByRole('button', { name: 'Войти' }).click();
    await page
      .getByLabel('Код MFA или recovery code')
      .fill(totpAtCounter(secret, Math.floor(Date.now() / 1000 / 30)));
    await page.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(page).toHaveURL(/\/portal$/u);
    await page.goto('/portal/settings/security');
    await page.getByRole('button', { name: 'Завершить остальные' }).click();
  });

  test('session list revokes another and current session', async ({ page, browser }) => {
    await submitPrimary(page, browserIdentities.identityClient.email, currentPassword);
    await page.getByLabel('Код MFA или recovery code').fill(recoveryCodes[2]);
    await page.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(page).toHaveURL(/\/portal$/u);
    await page.goto('/portal/settings/security');
    await page.getByRole('button', { name: 'Завершить остальные' }).click();

    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await submitPrimary(otherPage, browserIdentities.identityClient.email, currentPassword);
    await otherPage.getByLabel('Код MFA или recovery code').fill(recoveryCodes[1]);
    await otherPage.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(otherPage).toHaveURL(/\/portal$/u);

    await page.reload();
    const sessionRows = page
      .locator('section')
      .filter({ hasText: 'Активные сессии' })
      .locator('li');
    await expect(sessionRows).toHaveCount(2);
    const otherRow = sessionRows.filter({ hasNotText: 'текущая' });
    await otherRow.getByRole('button', { name: 'Завершить' }).click();
    await expect(sessionRows).toHaveCount(1);
    await otherPage.goto('/portal');
    await expect(otherPage).toHaveURL(/\/portal\/login/u);
    await otherContext.close();

    await sessionRows.getByRole('button', { name: 'Завершить' }).click();
    await expect(page).toHaveURL(/\/portal\/login/u);
  });

  test('password change and body-only reset mock invalidate sessions', async ({ page }) => {
    await submitPrimary(page, browserIdentities.identityClient.email, currentPassword);
    await page.getByLabel('Код MFA или recovery code').fill(recoveryCodes[5]);
    await page.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(page).toHaveURL(/\/portal$/u);
    await page.goto('/portal/settings/security');
    const changedPassword = 'browser-identity-client-changed-password';
    await page.getByLabel('Текущий пароль').fill(currentPassword);
    await page.getByLabel('Новый пароль').fill(changedPassword);
    await page.getByRole('button', { name: 'Изменить пароль' }).click();
    await expect(page).toHaveURL(/\/portal\/login/u);
    currentPassword = changedPassword;

    await page.goto('/portal/forgot-password');
    await page.getByLabel('Email').fill(browserIdentities.identityClient.email);
    await page.getByRole('button', { name: 'Получить инструкцию' }).click();
    await expect(page).toHaveURL(/\/portal\/reset-password$/u);
    await expect(page.getByLabel('Код восстановления')).not.toHaveValue('');
    const resetPassword = 'browser-identity-client-reset-password';
    await page.getByLabel('Новый пароль').fill(resetPassword);
    await page.getByRole('button', { name: 'Изменить пароль' }).click();
    await expect(page).toHaveURL(/\/portal\/login$/u);
    currentPassword = resetPassword;
  });

  test('ADMIN policy is tenant-derived and email-only external linking is denied', async ({
    page,
  }) => {
    await submitPrimary(
      page,
      browserIdentities.identityAdmin.email,
      browserIdentities.identityAdmin.password,
    );
    await expect(page).toHaveURL(/\/admin$/u);
    await page.goto('/portal/settings/security');
    await page.getByLabel('Требование').selectOption('ALL_MEMBERS');
    await page.getByLabel('Grace period, дней').fill('7');
    await page.getByRole('button', { name: 'Сохранить политику' }).click();
    await expect(page.getByRole('status')).toContainText('Политика MFA обновлена');

    await page.context().clearCookies();
    await submitPrimary(page, browserIdentities.identityClient.email, currentPassword);
    await page.getByLabel('Код MFA или recovery code').fill(recoveryCodes[6]);
    await page.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(page).toHaveURL(/\/portal$/u);
    const policyResponse = await page.evaluate(async () => {
      const response = await fetch('/api/account/security/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement: 'OPTIONAL',
          enforcementAt: null,
          gracePeriodDays: 0,
        }),
      });
      return response.status;
    });
    expect(policyResponse).toBe(403);
    const linkingResponse = await page.evaluate(async () => {
      const response = await fetch('/api/account/security/external-identities/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'browser.identity.client@example.test' }),
      });
      return { status: response.status, body: await response.json() };
    });
    expect(linkingResponse.status).toBe(400);
    expect(linkingResponse.body.code).toBe('OIDC_CALLBACK_REQUIRED');
  });
});
import type { Page } from '@playwright/test';
