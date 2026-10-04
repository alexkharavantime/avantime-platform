import { expect, test } from './fixtures';

const clientRoutes = [
  ['/ru/portal', /Добрый день/],
  ['/ru/portal/requests', /Обращения/],
  ['/ru/portal/requests/BROWSER-A-001', /Alpha browser request/],
  ['/ru/portal/documents', /Документы/],
  ['/ru/portal/documents/browser-doc-a', /alpha-browser-fixture\.png/],
  ['/ru/portal/knowledge', /База знаний и AI/],
  ['/ru/portal/company', /Компания и контактные данные/],
  ['/ru/portal/team', /Команда компании/],
  ['/ru/portal/notifications', /Уведомления/],
  ['/ru/portal/settings', /Настройки кабинета/],
  ['/ru/portal/settings/security', /Безопасность/],
] as const;

test.describe('portal browser smoke', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('tenantA');
  });

  for (const [route, heading] of clientRoutes) {
    test(`${route} renders through the authenticated portal`, async ({
      page,
      assertNoBrowserErrors,
    }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      if (route === '/ru/portal/documents') {
        await expect(page.getByText('alpha-browser-fixture.png')).toBeVisible();
      }
      if (route === '/ru/portal/notifications') {
        await expect(page.getByRole('list', { name: 'Список уведомлений' })).toBeVisible();
      }
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('body')).not.toContainText(
        /PrismaClient|node_modules|workerId|providerId|error stack/i,
      );
      await assertNoBrowserErrors();
    });
  }

  test('primary portal navigation changes routes', async ({ page, assertNoBrowserErrors }) => {
    await page.goto('/ru/portal');
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('link', { name: 'Обращения' })
      .click();
    await expect(page).toHaveURL(/\/ru\/portal\/requests$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Обращения' })).toBeVisible();
    await assertNoBrowserErrors();
  });

  test('All requests shortcut opens the localized list and survives reload', async ({ page }) => {
    await page.goto('/ru/portal');
    await page.getByRole('link', { name: 'Все обращения', exact: true }).click();
    await expect(page).toHaveURL(/\/ru\/portal\/requests$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Обращения' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Обращения' })).toBeVisible();

    await page.goto('/lv/portal/requests');
    await expect(page.getByRole('heading', { level: 1, name: 'Pieprasījumi' })).toBeVisible();
    await page.goto('/en/portal/requests');
    await expect(page.getByRole('heading', { level: 1, name: 'Requests' })).toBeVisible();
  });

  test('empty requests state is distinct for an organization with no requests', async ({
    page,
    loginAs,
  }) => {
    await page.context().clearCookies();
    await loginAs('identityClient');
    await page.goto('/ru/portal/requests');
    await expect(page.getByRole('heading', { level: 1, name: 'Обращения' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Обращений пока нет' })).toBeVisible();
  });

  test('CLIENT cannot open administrator routes', async ({ page, assertNoBrowserErrors }) => {
    await page.goto('/ru/admin/documents');
    await expect(page).toHaveURL(/\/ru\/portal$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await assertNoBrowserErrors();
  });

  test('ADMIN uses the ordinary login flow and can open document management', async ({
    page,
    loginAs,
    assertNoBrowserErrors,
  }) => {
    await page.context().clearCookies();
    await loginAs('admin');
    await page.goto('/ru/admin/documents');
    await expect(page.getByRole('heading', { level: 1, name: /База знаний/ })).toBeVisible();
    await assertNoBrowserErrors();
  });
});
