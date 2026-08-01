import { expect, test } from './fixtures';

test.describe('@platform-governance scope separation', () => {
  test('organization administrator does not inherit platform access', async ({ page, loginAs }) => {
    await loginAs('identityAdmin');
    await page.goto('/portal/platform');
    await expect(page).toHaveURL(/\/portal$/u);
    await expect(page.getByRole('link', { name: 'Управление платформой' })).toHaveCount(0);
  });

  test('explicit platform assignment exposes protected governance routes', async ({
    page,
    loginAs,
    runAxe,
  }) => {
    await loginAs('admin');
    await page.goto('/portal/platform');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Управление платформой' }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Управление платформой' })).toBeVisible();
    await runAxe('platform-governance');
  });

  test('organization knowledge excludes a foreign tenant', async ({ page, loginAs }) => {
    await loginAs('tenantA');
    await page.goto('/portal/knowledge');
    await expect(page.getByText('Alpha organization knowledge')).toBeVisible();
    await expect(page.getByText('Beta confidential knowledge')).toHaveCount(0);
    await page.goto('/portal/knowledge/browser-tenant-b-knowledge');
    // App Router may have started streaming the authenticated portal layout before notFound(),
    // so the security assertion is the rendered 404 boundary plus absence of foreign content.
    await expect(page.getByRole('heading', { level: 1, name: '404' })).toBeVisible();
    await expect(page.getByText('Beta confidential knowledge')).toHaveCount(0);
  });
});
