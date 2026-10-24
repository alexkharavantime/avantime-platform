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
  const submit = page.getByRole('button', { name: 'Войти' });

  await submit.click();
  await expect(page.getByText('Вход временно недоступен.')).toBeVisible();
  await expect(submit).toBeEnabled();

  await submit.click();
  await expect(page.getByText('Неверный адрес электронной почты или пароль.')).toBeVisible();
  await expect(submit).toBeEnabled();
  expect(attempts).toBe(2);
});

test('toggles password visibility accessibly and submits with Enter on mobile and desktop', async ({
  page,
}) => {
  const localeLabels = [
    { locale: 'ru', show: 'Показать пароль', hide: 'Скрыть пароль' },
    { locale: 'lv', show: 'Rādīt paroli', hide: 'Slēpt paroli' },
    { locale: 'en', show: 'Show password', hide: 'Hide password' },
  ];

  let attempts = 0;
  let submittedCredentials: { email?: string; password?: string } = {};
  await page.route('**/api/auth/login', async (route) => {
    attempts += 1;
    submittedCredentials = route.request().postDataJSON() as typeof submittedCredentials;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Invalid credentials.',
        errorCode: 'AUTH_INVALID_CREDENTIALS',
      }),
    });
  });

  for (const { locale, show, hide } of localeLabels) {
    await page.goto(`/${locale}/portal/login`);
    const password = page.locator('input[autocomplete="current-password"]');
    const showButton = page.getByRole('button', { name: show });
    await expect(password).toHaveAttribute('type', 'password');
    await expect(showButton).toHaveAttribute('type', 'button');
    await expect(showButton).toHaveAttribute('aria-pressed', 'false');

    await password.fill('manual-test-password');
    await showButton.click();
    const hideButton = page.getByRole('button', { name: hide });
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue('manual-test-password');
    await expect(hideButton).toHaveAttribute('aria-pressed', 'true');
    expect(attempts).toBe(0);

    await hideButton.click();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(password).toHaveValue('manual-test-password');

  }

  expect(attempts).toBe(0);
  await page.goto('/ru/portal/login');
  const password = page.locator('input[autocomplete="current-password"]');
  await password.fill('manual-test-password');

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    const showAgain = page.getByRole('button', { name: 'Показать пароль' });
    const geometry = await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>(
        'input[autocomplete="current-password"]',
      );
      const button = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Показать пароль"]',
      );
      if (!input || !button) throw new Error('Password visibility controls are missing.');
      const inputBounds = input.getBoundingClientRect();
      const buttonBounds = button.getBoundingClientRect();
      return {
        inputLeft: inputBounds.left,
        inputRight: inputBounds.right,
        buttonLeft: buttonBounds.left,
        buttonRight: buttonBounds.right,
        buttonWidth: buttonBounds.width,
        inputPaddingRight: Number.parseFloat(getComputedStyle(input).paddingRight),
      };
    });
    expect(geometry.buttonLeft).toBeGreaterThanOrEqual(geometry.inputLeft);
    expect(geometry.buttonRight).toBeLessThanOrEqual(geometry.inputRight);
    expect(geometry.inputPaddingRight).toBeGreaterThanOrEqual(geometry.buttonWidth);
    await expect(showAgain).toBeVisible();
  }

  await password.press('Enter');
  await expect(page.getByText('Неверный адрес электронной почты или пароль.')).toBeVisible();
  expect(submittedCredentials).toEqual({
    email: '',
    password: 'manual-test-password',
  });
  expect(attempts).toBe(1);
});
