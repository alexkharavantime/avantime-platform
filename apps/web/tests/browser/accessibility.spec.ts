import { expect, test } from './fixtures';

const routes = [
  ['/portal', 'home'],
  ['/portal/requests', 'requests'],
  ['/portal/documents', 'documents'],
  ['/portal/knowledge', 'knowledge'],
  ['/portal/company', 'company'],
  ['/portal/team', 'team'],
  ['/portal/notifications', 'notifications'],
  ['/portal/settings', 'settings'],
  ['/portal/settings/security', 'security-settings'],
] as const;

test.describe('@accessibility portal WCAG automation', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('tenantA');
  });

  for (const [route, name] of routes) {
    test(`${name} has no critical or serious WCAG A/AA axe findings`, async ({
      page,
      runAxe,
      assertNoBrowserErrors,
    }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await runAxe(name);
      await assertNoBrowserErrors();
    });
  }

  test('landmarks, headings, form labels and media alternatives are present', async ({ page }) => {
    await page.goto('/portal/team');
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    for (const input of await page.locator('input').all()) {
      await expect(input).toHaveAccessibleName(/.+/);
    }
    for (const image of await page.locator('img').all()) {
      const alt = await image.getAttribute('alt');
      expect(alt).not.toBeNull();
    }
    for (const table of await page.locator('table').all()) {
      expect(await table.locator('th').count()).toBeGreaterThan(0);
    }
  });

  test('keyboard focus is visible and navigation is operable', async ({ page }) => {
    await page.goto('/portal');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#portal-content')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
  });
});
