import { browserIdentities } from './environment';
import { expect, test } from './fixtures';

test('activation URL redeems its query token automatically and only once', async ({ page }) => {
  await page.goto('/ru/portal/login');
  const token = await page.evaluate(async (email) => {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as { resetToken?: string };
    return data.resetToken ?? '';
  }, browserIdentities.identityClient.email);
  expect(token.length === 43).toBe(true);

  await page.goto(`/ru/portal/reset-password?token=${encodeURIComponent(token)}`);
  await expect(page.getByLabel('Код восстановления')).toHaveCount(0);
  await expect(page.getByLabel('Новый пароль')).toBeVisible();
  await expect(page).toHaveURL(/\/ru\/portal\/reset-password$/u);

  const password = 'browser-identity-client-link-reset-password';
  const redemptionRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/api/auth/reset-password' &&
      request.method() === 'POST',
  );
  await page.getByLabel('Новый пароль').fill(password);
  await page.getByRole('button', { name: 'Изменить пароль' }).click();
  const redemptionBody = (await (await redemptionRequest).postDataJSON()) as { token?: string };
  expect(redemptionBody.token === token).toBe(true);
  await expect(page).toHaveURL(/\/ru\/portal\/login$/u);

  const replayStatus = await page.evaluate(async ({ resetToken, newPassword }) => {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password: newPassword }),
    });
    return response.status;
  }, { resetToken: token, newPassword: password });
  expect(replayStatus).toBe(400);
});