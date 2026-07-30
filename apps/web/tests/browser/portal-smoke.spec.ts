import { expect, test } from './fixtures';

const clientRoutes = [
  ['/portal', /Добрый день/],
  ['/portal/requests', /Обращения/],
  ['/portal/requests/BROWSER-A-001', /Alpha browser request/],
  ['/portal/documents', /Документы/],
  ['/portal/documents/browser-doc-a', /alpha-browser-fixture\.png/],
  ['/portal/knowledge', /База знаний и AI/],
  ['/portal/company', /Компания и контактные данные/],
  ['/portal/team', /Команда компании/],
  ['/portal/notifications', /Уведомления/],
  ['/portal/settings', /Настройки кабинета/],
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
      if (route === '/portal/documents') {
        await expect(page.getByText('alpha-browser-fixture.png')).toBeVisible();
      }
      if (route === '/portal/notifications') {
        await expect(page.getByText('Alpha browser notification')).toBeVisible();
      }
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('body')).not.toContainText(
        /PrismaClient|node_modules|workerId|providerId|error stack/i,
      );
      await assertNoBrowserErrors();
    });
  }

  test('primary portal navigation changes routes', async ({ page, assertNoBrowserErrors }) => {
    await page.goto('/portal');
    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('link', { name: 'Обращения' })
      .click();
    await expect(page).toHaveURL(/\/portal\/requests$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Обращения' })).toBeVisible();
    await assertNoBrowserErrors();
  });

  test('CLIENT cannot open administrator routes', async ({ page, assertNoBrowserErrors }) => {
    await page.goto('/admin/documents');
    await expect(page).toHaveURL(/\/portal$/);
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
    await page.goto('/admin/documents');
    await expect(page.getByRole('heading', { level: 1, name: /База знаний/ })).toBeVisible();
    await assertNoBrowserErrors();
  });
});
