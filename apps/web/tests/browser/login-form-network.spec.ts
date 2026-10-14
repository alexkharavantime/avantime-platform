import { expect, test } from './fixtures';

test('shows an error and allows manual retry when the login request fails', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/auth/login', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Invalid credentials.',
        errorCode: 'AUTH_INVALID_CREDENTIALS',
      }),
    });
  });

  await page.goto('/ru/portal/login');
  await page.locator('input[type="email"]').fill('login-diagnostic@example.invalid');
  await page.locator('input[type="password"]').fill('synthetic-invalid-password');
  const submit = page.locator('form button').first();

  await submit.click();
  await expect(page.getByText('Вход временно недоступен.')).toBeVisible();
  await expect(submit).toBeEnabled();

  await submit.click();
  await expect(page.getByText('Неверный адрес электронной почты или пароль.')).toBeVisible();
  await expect(submit).toBeEnabled();
  expect(attempts).toBe(2);
});
