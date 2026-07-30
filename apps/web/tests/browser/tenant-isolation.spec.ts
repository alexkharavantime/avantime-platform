import { expect, test } from './fixtures';

test.describe('browser tenant isolation', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('tenantA');
  });

  test('tenant A cannot read tenant B request through a direct URL', async ({ page }) => {
    await page.goto('/portal/requests/BROWSER-B-001');
    await expect(page.getByRole('heading', { level: 1, name: '404' })).toBeVisible();
    await expect(page.getByText('Beta confidential browser request')).toHaveCount(0);
    await expect(page.getByText('Beta confidential fixture message')).toHaveCount(0);
  });

  test('tenant A cannot read tenant B document through a direct URL', async ({
    page,
    allowApiFailure,
  }) => {
    allowApiFailure('GET', '/api/documents/item', 404);
    await page.goto('/portal/documents/browser-doc-b');
    await expect(page.getByText('Документ не найден.')).toBeVisible();
    await expect(page.getByText('beta-confidential-fixture.png')).toHaveCount(0);
  });

  test('tenant A list and notifications never expose tenant B records', async ({ page }) => {
    await page.goto('/portal/requests?companyId=browser-tenant-b');
    await expect(page.getByText('Alpha browser request')).toBeVisible();
    await expect(page.getByText('Beta confidential browser request')).toHaveCount(0);

    await page.goto('/portal/documents?companyId=browser-tenant-b');
    await expect(page.getByText('alpha-browser-fixture.png')).toBeVisible();
    await expect(page.getByText('beta-confidential-fixture.png')).toHaveCount(0);

    await page.goto('/portal/notifications?companyId=browser-tenant-b');
    await expect(page.getByText('Alpha browser notification')).toBeVisible();
    await expect(page.getByText('Beta confidential notification')).toHaveCount(0);
  });

  test('client companyId in notification action cannot switch tenant', async ({ page }) => {
    const response = await page.request.post('/api/portal/notifications', {
      data: {
        id: 'browser-notification-b',
        companyId: 'browser-tenant-b',
      },
    });
    expect(response.status()).toBe(400);
    expect(await response.text()).not.toContain('Beta confidential notification');
  });
});
