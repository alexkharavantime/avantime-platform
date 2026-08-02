import { expect, test } from './fixtures';

test.describe('@staging-smoke TASK-015 browser baseline', () => {
  test('@responsive login, portal, support and knowledge render without unsafe errors', async ({
    page,
    loginAs,
    assertNoBrowserErrors,
  }) => {
    await page.goto('/portal/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Пароль')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();

    await loginAs('tenantA');
    for (const [route, heading] of [
      ['/portal', /Добрый день/],
      ['/portal/requests', /Обращения/],
      ['/portal/knowledge', /База знаний и AI/],
    ] as const) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }

    await page.goto('/portal/requests/staging-smoke-missing');
    await expect(page.locator('body')).not.toContainText(
      /PrismaClient|node_modules|DATABASE_URL|SESSION_SECRET|error stack/iu,
    );

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth - layout.clientWidth).toBeLessThanOrEqual(1);
    await assertNoBrowserErrors();
  });
});
