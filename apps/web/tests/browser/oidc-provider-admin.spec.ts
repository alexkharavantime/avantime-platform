import { expect, test } from './fixtures';

test.describe.serial('TASK-010 OIDC provider administration', () => {
  test('tenant ADMIN creates a disabled provider without exposing the secret reference', async ({
    page,
    loginAs,
    allowApiFailure,
    assertNoBrowserErrors,
  }, testInfo) => {
    testInfo.setTimeout(120_000);
    await loginAs('identityAdmin');
    await page.goto('/portal/settings/security/identity-providers');
    await expect(page.getByRole('heading', { name: 'Identity providers', level: 1 })).toBeVisible();
    expect((await page.request.get('/api/account/security/identity-providers')).ok()).toBe(true);
    const newProviderPage = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/portal/settings/security/identity-providers/new' &&
        response.request().resourceType() === 'fetch' &&
        response.ok(),
      { timeout: 50_000 },
    );
    await page.getByRole('link', { name: 'Добавить провайдера' }).click();
    await newProviderPage;
    await expect(
      page.getByRole('heading', { name: 'Новая OIDC конфигурация', level: 1 }),
    ).toBeVisible();

    await page.getByLabel('Тип провайдера').selectOption('GENERIC_OIDC');
    await page.getByLabel('Stable key').fill('browser-enterprise-oidc');
    await page.getByLabel('Display name').fill('Browser Enterprise OIDC');
    await page.getByLabel('Client ID').fill('browser-oidc-client');
    await page.getByLabel('Issuer').fill('http://127.0.0.1:4567');
    await page
      .getByLabel('Discovery URL')
      .fill('http://127.0.0.1:4567/.well-known/openid-configuration');
    await page.getByLabel('Новый client-secret reference').fill('env:OIDC_BROWSER_CLIENT_SECRET');
    const creationResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/account/security/identity-providers' &&
        response.request().method() === 'POST',
      { timeout: 50_000 },
    );
    const providerDetailPage = page.waitForResponse(
      (response) =>
        /^\/portal\/settings\/security\/identity-providers\/[^/]+$/u.test(
          new URL(response.url()).pathname,
        ) &&
        response.request().resourceType() === 'fetch' &&
        response.ok(),
      { timeout: 50_000 },
    );
    await page.getByRole('button', { name: 'Сохранить конфигурацию' }).click();
    expect((await creationResponse).ok()).toBe(true);
    await providerDetailPage;

    await expect(page).toHaveURL(/\/portal\/settings\/security\/identity-providers\/[^/]+$/u);
    await expect(page.getByText('NOT_VALIDATED', { exact: true })).toBeVisible();
    await expect(page.getByText(/настроен · key browser-v1/u)).toBeVisible();
    await expect(page.getByLabel('Новый client-secret reference')).toHaveValue('');
    await expect(page.locator('body')).not.toContainText('OIDC_BROWSER_CLIENT_SECRET');
    await assertNoBrowserErrors();

    const providerId = new URL(page.url()).pathname.split('/').at(-1);
    expect(providerId).toBeTruthy();
    allowApiFailure('POST', `/api/account/security/identity-providers/${providerId}/status`, 409);
    await page.getByRole('button', { name: 'Включить после validation' }).click();
    await expect(page.getByRole('status')).toContainText('Статус провайдера не изменён');
  });

  test('client tenant identifier is rejected and CLIENT cannot open provider administration', async ({
    page,
    loginAs,
    allowApiFailure,
    assertNoBrowserErrors,
  }) => {
    await loginAs('identityAdmin');
    await assertNoBrowserErrors();
    allowApiFailure('POST', '/api/account/security/identity-providers', 400);
    const rejected = await page.evaluate(async () => {
      const response = await fetch('/api/account/security/identity-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: 'browser-tenant-a' }),
      });
      return { status: response.status, body: await response.json() };
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe('TENANT_INPUT_REJECTED');

    await page.context().clearCookies();
    await loginAs('tenantA');
    await page.goto('/portal/settings/security/identity-providers');
    await expect(page).toHaveURL(/\/portal$/u);
  });

  test('@accessibility provider list has no critical or serious findings', async ({
    page,
    loginAs,
    runAxe,
    assertNoBrowserErrors,
  }) => {
    await loginAs('identityAdmin');
    await page.goto('/portal/settings/security/identity-providers');
    await expect(page.getByRole('heading', { name: 'Identity providers', level: 1 })).toBeVisible();
    await runAxe('identity-providers');
    await assertNoBrowserErrors();
  });
});
