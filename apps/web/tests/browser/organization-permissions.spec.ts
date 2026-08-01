import type { APIResponse, BrowserContext, Page } from '@playwright/test';

import { browserIdentities } from './environment';
import { expect, test } from './fixtures';

async function login(page: Page, identity: keyof typeof browserIdentities) {
  const credentials = browserIdentities[identity];
  await page.goto('/portal/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Пароль').fill(credentials.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(/\/portal$/u);
}

async function patchMembership(page: Page, membershipId: string, body: Record<string, unknown>) {
  return page.evaluate(
    async ({ id, input }) => {
      const response = await fetch(`/api/team/members/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return { status: response.status, body: await response.json() };
    },
    { id: membershipId, input: body },
  );
}

async function expectServerRedirect(response: APIResponse, target: string) {
  if (response.status() === 307) {
    expect(response.headers().location).toBe(target);
    return;
  }
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain(`NEXT_REDIRECT;replace;${target};307;`);
}

test.describe.serial('TASK-011 organization permissions', () => {
  test('navigation and deep links follow organization roles', async ({
    page,
    loginAs,
    assertNoBrowserErrors,
  }) => {
    await loginAs('identityOwner');
    const ownerNavigation = page.getByRole('navigation', { name: 'Основная навигация' });
    await expect(ownerNavigation.getByRole('link', { name: 'Команда' })).toBeVisible();
    await expect(
      ownerNavigation.getByRole('link', { name: 'Управление документами' }),
    ).toBeVisible();
    await page.goto('/portal/settings/security');
    await expect(
      page.getByRole('link', { name: 'Управлять identity providers и SSO policy' }),
    ).toBeVisible();
    await page.waitForLoadState('networkidle');

    await page.context().clearCookies();
    await loginAs('identityManager');
    const managerNavigation = page.getByRole('navigation', { name: 'Основная навигация' });
    await expect(managerNavigation.getByRole('link', { name: 'Команда' })).toBeVisible();
    await expect(
      managerNavigation.getByRole('link', { name: 'Управление документами' }),
    ).toBeVisible();
    const managerDeepLink = await page.request.get('/portal/settings/security/identity-providers', {
      maxRedirects: 0,
    });
    await expectServerRedirect(managerDeepLink, '/portal');

    await page.context().clearCookies();
    await loginAs('identityViewer');
    const viewerNavigation = page.getByRole('navigation', { name: 'Основная навигация' });
    await expect(viewerNavigation.getByRole('link', { name: 'Команда' })).toHaveCount(0);
    await expect(
      viewerNavigation.getByRole('link', { name: 'Управление документами' }),
    ).toHaveCount(0);
    const viewerDeepLink = await page.request.get('/portal/requests/new', { maxRedirects: 0 });
    await expectServerRedirect(viewerDeepLink, '/portal/requests');
    await assertNoBrowserErrors();
  });

  test('client companyId is rejected and the last OWNER is protected', async ({
    page,
    loginAs,
    allowApiFailure,
    diagnostics,
  }) => {
    await loginAs('identityOwner');
    allowApiFailure('POST', '/api/team', 400);
    const tenantInput = await page.evaluate(async () => {
      const response = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: 'browser-tenant-a',
          name: 'Unsafe tenant input',
          email: 'unsafe@example.test',
        }),
      });
      return response.status;
    });
    expect(tenantInput).toBe(400);

    allowApiFailure('PATCH', '/api/team/members/browser-membership-identity-owner', 409);
    const lastOwner = await patchMembership(page, 'browser-membership-identity-owner', {
      action: 'role',
      role: 'ADMIN',
      expectedVersion: 1,
    });
    expect(lastOwner.status).toBe(409);
    expect(lastOwner.body.error).toContain('последнего действующего владельца');
    expect(diagnostics).toEqual([
      {
        kind: 'console',
        message: 'Failed to load resource: the server responded with a status of 400 (Bad Request)',
      },
      {
        kind: 'console',
        message: 'Failed to load resource: the server responded with a status of 409 (Conflict)',
      },
    ]);
  });

  test('role changes are versioned and MANAGER escalation is denied', async ({
    page,
    loginAs,
    allowApiFailure,
    diagnostics,
  }) => {
    await loginAs('identityOwner');
    const demoted = await patchMembership(page, 'browser-membership-identity-manager', {
      action: 'role',
      role: 'MEMBER',
      expectedVersion: 1,
    });
    expect(demoted.status).toBe(200);
    expect(demoted.body.membership.role).toBe('MEMBER');
    const restored = await patchMembership(page, 'browser-membership-identity-manager', {
      action: 'role',
      role: 'MANAGER',
      expectedVersion: 2,
    });
    expect(restored.status).toBe(200);
    expect(restored.body.membership.role).toBe('MANAGER');

    await page.context().clearCookies();
    await loginAs('identityManager');
    allowApiFailure('PATCH', '/api/team/members/browser-membership-identity-viewer', 403);
    const escalation = await patchMembership(page, 'browser-membership-identity-viewer', {
      action: 'role',
      role: 'ADMIN',
      expectedVersion: 1,
    });
    expect(escalation.status).toBe(403);
    expect(escalation.body.error).toBe('Недостаточно прав.');
    expect(diagnostics).toEqual([
      {
        kind: 'console',
        message: 'Failed to load resource: the server responded with a status of 403 (Forbidden)',
      },
    ]);
  });

  test('document and organization security actions follow server permissions', async ({
    page,
    loginAs,
    assertNoBrowserErrors,
  }) => {
    await loginAs('identityManager');
    await page.goto('/admin/documents');
    await expect(
      page.getByRole('heading', { level: 1, name: 'База знаний Avantime' }),
    ).toBeVisible();
    await expect(page.getByText('Загрузить документ')).toBeVisible();
    await page.goto('/portal/settings/security');
    await expect(
      page.getByRole('link', { name: 'Управлять identity providers и SSO policy' }),
    ).toHaveCount(0);

    await page.context().clearCookies();
    await loginAs('identityViewer');
    await page.goto('/admin/documents');
    await expect(page).toHaveURL(/\/portal$/u);
    await page.goto('/portal/settings/security');
    await expect(page.getByText('Политика MFA организации')).toHaveCount(0);
    await assertNoBrowserErrors();
  });

  test('suspension invalidates an existing session and reactivation is versioned', async ({
    page,
    browser,
    loginAs,
    assertNoBrowserErrors,
  }) => {
    await loginAs('identityViewer');
    const ownerContext: BrowserContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await login(ownerPage, 'identityOwner');

    const suspended = await patchMembership(ownerPage, 'browser-membership-identity-viewer', {
      action: 'status',
      status: 'SUSPENDED',
      expectedVersion: 1,
    });
    expect(suspended.status).toBe(200);
    expect(suspended.body.membership.status).toBe('SUSPENDED');

    await page.goto('/portal');
    await expect(page).toHaveURL(/\/portal\/login/u);

    const reactivated = await patchMembership(ownerPage, 'browser-membership-identity-viewer', {
      action: 'status',
      status: 'ACTIVE',
      expectedVersion: 2,
    });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.membership.status).toBe('ACTIVE');
    await ownerContext.close();
    await assertNoBrowserErrors();
  });

  test('@accessibility team governance and mobile permission navigation are usable', async ({
    page,
    loginAs,
    runAxe,
    assertNoBrowserErrors,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs('identityOwner');
    await page.goto('/portal/team');
    await expect(page.getByRole('heading', { level: 1, name: 'Команда компании' })).toBeVisible();
    await runAxe('organization-team-governance');
    await page.getByRole('button', { name: 'Меню' }).click();
    const mobileNavigation = page.getByRole('dialog', { name: 'Мобильная навигация' });
    await expect(mobileNavigation.getByRole('link', { name: 'Команда' })).toBeVisible();
    await expect(
      mobileNavigation.getByRole('link', { name: 'Управление документами' }),
    ).toBeVisible();
    await assertNoBrowserErrors();
  });
});
