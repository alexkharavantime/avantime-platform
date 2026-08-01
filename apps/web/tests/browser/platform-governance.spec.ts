import { expect, test } from './fixtures';
import { browserIdentities } from './environment';

async function loginOnPage(
  page: import('@playwright/test').Page,
  identity: keyof typeof browserIdentities,
) {
  const credentials = browserIdentities[identity];
  await page.goto('/portal/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Пароль').fill(credentials.password);
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/login' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Войти' }).click();
  expect((await responsePromise).ok()).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('@platform-governance scope separation', () => {
  test('@responsive platform governance pages do not overflow', async ({ page, loginAs }) => {
    await loginAs('admin');
    for (const path of [
      '/portal/platform',
      '/portal/platform/roles',
      '/portal/platform/support',
      '/portal/platform/approvals',
      '/portal/platform/audit',
    ]) {
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.scrollWidth, `${path} horizontal overflow`).toBeLessThanOrEqual(
        dimensions.clientWidth,
      );
    }
  });

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

  test('support-session lifecycle is visible and termination removes access evidence', async ({
    page,
    loginAs,
    runAxe,
  }) => {
    await loginAs('admin');
    const created = await page.request.post('/api/platform/support/sessions', {
      headers: { origin: 'http://127.0.0.1:3410' },
      data: {
        companyId: browserIdentities.tenantB.companyId,
        reasonCode: 'BROWSER_REVIEW',
        ticketReference: 'TASK-013-BROWSER',
        allowedScopes: ['platform.support.resource.view'],
      },
    });
    expect(created.status()).toBe(201);
    const body = (await created.json()) as { id: string };
    await page.goto('/portal/platform/support');
    await expect(page.getByRole('status').filter({ hasText: 'Активна' })).toBeVisible();
    await expect(page.getByText('TASK-013-BROWSER')).toBeVisible();
    await runAxe('platform-support-active');
    const ended = await page.request.delete(`/api/platform/support/sessions/${body.id}`, {
      headers: { origin: 'http://127.0.0.1:3410' },
    });
    expect(ended.status()).toBe(204);
    await page.reload();
    await expect(page.getByText('TASK-013-BROWSER')).toHaveCount(0);
    await expect(page.getByText('Активных support-сессий нет.')).toBeVisible();
  });

  test('second actor approves owner assignment and replay is denied', async ({
    browser,
    page,
    loginAs,
    runAxe,
  }) => {
    await loginAs('admin');
    const requested = await page.request.post('/api/governance/approvals', {
      headers: { origin: 'http://127.0.0.1:3410' },
      data: {
        actionType: 'PLATFORM_OWNER_ASSIGN',
        scope: 'PLATFORM',
        resourceId: 'browser-user-a',
        expectedVersion: 0,
        safeParameters: { targetUserId: 'browser-user-a', assignmentVersion: 0 },
        confirmation: 'ASSIGN PLATFORM OWNER',
      },
    });
    expect(requested.status()).toBe(201);
    const approval = (await requested.json()) as { id: string };

    const approverContext = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': '198.18.253.13' },
    });
    try {
      const approverPage = await approverContext.newPage();
      await loginOnPage(approverPage, 'identityOwner');
      const decision = await approverPage.request.post(
        `/api/governance/approvals/${approval.id}/decision`,
        {
          headers: { origin: 'http://127.0.0.1:3410' },
          data: { approved: true },
        },
      );
      expect(decision.status()).toBe(200);
    } finally {
      await approverContext.close();
    }

    const executed = await page.request.post('/api/platform/roles/browser-user-a/owner', {
      headers: { origin: 'http://127.0.0.1:3410' },
      data: { approvalId: approval.id, action: 'ASSIGN' },
    });
    expect(executed.status()).toBe(200);
    const replay = await page.request.post('/api/platform/roles/browser-user-a/owner', {
      headers: { origin: 'http://127.0.0.1:3410' },
      data: { approvalId: approval.id, action: 'ASSIGN' },
    });
    expect(replay.status()).toBe(409);
    await page.goto('/portal/platform/approvals');
    await expect(page.getByText(/^EXECUTED ·/u)).toBeVisible();
    await expect(page.getByText(/^REJECTED ·/u)).toBeVisible();
    await expect(page.getByText(/^CANCELLED ·/u)).toBeVisible();
    await expect(page.getByText(/^EXPIRED ·/u)).toBeVisible();
    await runAxe('platform-approval-states');
  });

  test('organization knowledge publication records approval and archive removes public read', async ({
    browser,
  }) => {
    const requesterContext = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': '198.18.253.14' },
    });
    const approverContext = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': '198.18.253.15' },
    });
    try {
      const requesterPage = await requesterContext.newPage();
      const approverPage = await approverContext.newPage();
      await loginOnPage(requesterPage, 'identityOwner');
      await loginOnPage(approverPage, 'identityAdmin');
      const requested = await requesterPage.request.post('/api/governance/approvals', {
        headers: { origin: 'http://127.0.0.1:3410' },
        data: {
          actionType: 'KNOWLEDGE_VISIBILITY_PUBLIC',
          scope: 'ORGANIZATION',
          resourceId: 'browser-article-publication-review',
          expectedVersion: 1,
          safeParameters: {
            articleId: 'browser-article-publication-review',
            articleVersion: 1,
          },
          confirmation: 'PUBLISH ORGANIZATION KNOWLEDGE',
        },
      });
      expect(requested.status()).toBe(201);
      const approval = (await requested.json()) as { id: string };
      const decision = await approverPage.request.post(
        `/api/governance/approvals/${approval.id}/decision`,
        {
          headers: { origin: 'http://127.0.0.1:3410' },
          data: { approved: true },
        },
      );
      expect(decision.status()).toBe(200);
      const visibility = await requesterPage.request.post(
        '/api/admin/knowledge/browser-article-publication-review/visibility',
        {
          headers: { origin: 'http://127.0.0.1:3410' },
          data: { visibility: 'PUBLIC', expectedVersion: 1, approvalId: approval.id },
        },
      );
      expect(visibility.status()).toBe(200);
      const published = await requesterPage.request.post(
        '/api/admin/knowledge/browser-article-publication-review/status',
        {
          headers: { origin: 'http://127.0.0.1:3410' },
          form: { status: 'PUBLISHED', expectedVersion: '2' },
          maxRedirects: 0,
        },
      );
      expect(published.status()).toBe(303);
      await requesterPage.goto('/knowledge/browser-publication-review');
      await expect(
        requesterPage.getByRole('heading', { level: 1, name: 'Governance publication review' }),
      ).toBeVisible();
      const archived = await requesterPage.request.post(
        '/api/admin/knowledge/browser-article-publication-review/status',
        {
          headers: { origin: 'http://127.0.0.1:3410' },
          form: { status: 'ARCHIVED', expectedVersion: '3' },
          maxRedirects: 0,
        },
      );
      expect(archived.status()).toBe(303);
      await requesterPage.goto('/knowledge/browser-publication-review');
      await expect(requesterPage.getByRole('heading', { level: 1, name: '404' })).toBeVisible();
    } finally {
      await requesterContext.close();
      await approverContext.close();
    }
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
