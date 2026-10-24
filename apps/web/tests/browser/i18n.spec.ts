import { expect, test } from './fixtures';

test('admin locale selection persists across refresh, queue navigation and logout', async ({
  page,
  loginAs,
}) => {
  await loginAs('admin');
  await page.goto('/ru/admin');
  await expect(page).toHaveURL(/\/ru\/admin$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Управление клиентским сервисом' })).toBeVisible();

  await page.getByRole('link', { name: 'EN', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/admin$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Customer service management' })).toBeVisible();

  await page.getByRole('link', { name: 'LV', exact: true }).click();
  await expect(page).toHaveURL(/\/lv\/admin$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Klientu servisa pārvaldība' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Klientu servisa pārvaldība' })).toBeVisible();

  const localeCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'avantime_locale');
  expect(localeCookie).toMatchObject({ value: 'lv', httpOnly: true });

  for (const [locale, heading] of [
    ['lv', 'E-pasta rinda'],
    ['ru', 'Очередь электронной почты'],
    ['en', 'Email queue'],
  ] as const) {
    await page.goto(`/${locale}/admin/email-queue`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }

  await page.goto('/ru/admin');
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/ru\/portal\/login$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Вход' })).toBeVisible();
  await expect(page.getByText('Электронная почта')).toBeVisible();
});

test('portal locale selection preserves the signed-in session and saved choice', async ({
  page,
  loginAs,
}) => {
  await loginAs('tenantA');
  await page.goto('/ru/portal');
  await expect(page).toHaveURL(/\/ru\/portal$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Добрый день, Browser User Alpha' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Язык' }).getByRole('link', { name: 'EN' }).click();
  await expect(page).toHaveURL(/\/en\/portal$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Good day, Browser User Alpha' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Good day, Browser User Alpha' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'LV' }).click();
  await expect(page).toHaveURL(/\/lv\/portal$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Labdien, Browser User Alpha' })).toBeVisible();

  const localeCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'avantime_locale');
  expect(localeCookie).toMatchObject({ value: 'lv', httpOnly: true });
});