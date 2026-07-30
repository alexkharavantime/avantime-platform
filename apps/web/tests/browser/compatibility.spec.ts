import { expect, test } from './fixtures';

const clientRedirects = [
  ['/dashboard', '/portal'],
  ['/dashboard/support', '/portal/requests'],
  ['/dashboard/projects', '/portal/requests'],
  ['/dashboard/documents', '/portal/documents'],
  ['/dashboard/ai', '/portal/knowledge'],
  ['/dashboard/settings', '/portal/settings'],
  ['/dashboard/knowledge', '/portal/knowledge'],
] as const;

test.describe('legacy dashboard compatibility', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('tenantA');
  });

  for (const [legacy, target] of clientRedirects) {
    test(`${legacy} redirects safely to ${target}`, async ({ page, assertNoBrowserErrors }) => {
      await page.goto(`${legacy}?source=browser`);
      await expect(page).toHaveURL(
        new RegExp(`${target.replaceAll('/', '\\/')}\\?source=browser$`),
      );
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await assertNoBrowserErrors();
    });
  }

  test('document deep link preserves query and tenant role', async ({
    page,
    assertNoBrowserErrors,
  }) => {
    await page.goto('/dashboard/knowledge/browser-doc-a?source=browser');
    await expect(page).toHaveURL(/\/portal\/documents\/browser-doc-a\?source=browser$/);
    await expect(
      page.getByRole('heading', { level: 1, name: /alpha-browser-fixture/ }),
    ).toBeVisible();
    await assertNoBrowserErrors();
  });

  test('ADMIN legacy knowledge link resolves to administration', async ({
    page,
    loginAs,
    assertNoBrowserErrors,
  }) => {
    await page.context().clearCookies();
    await loginAs('admin');
    await page.goto('/dashboard/knowledge?source=browser');
    await expect(page).toHaveURL(/\/admin\/documents\?source=browser$/);
    await assertNoBrowserErrors();
  });

  test('unknown legacy path terminates at a safe 404 without a redirect loop', async ({ page }) => {
    const response = await page.goto('/dashboard/not-a-route');
    expect(response?.status()).toBe(404);
    await expect(page).toHaveURL(/\/dashboard\/not-a-route$/);
  });
});
