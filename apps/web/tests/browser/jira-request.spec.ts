import { expect, test } from './fixtures';

test('customer creates a Jira request without duplicate issue or cross-tenant access', async ({
  page,
  loginAs,
  runAxe,
  allowApiFailure,
  assertNoBrowserErrors,
}) => {
  await loginAs('tenantA');
  await page.goto('/portal/requests/new');
  await runAxe('jira-request-form');
  await page.getByLabel('Тема').fill('Browser Jira request');
  await page.getByLabel('Категория').selectOption({ label: 'Интеграция' });
  await page.getByLabel('Приоритет').selectOption('HIGH');
  await page
    .getByLabel('Описание')
    .fill('Synthetic browser request that validates the TASK-016 Jira creation flow.');

  const creationRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/api/requests' && request.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Создать обращение' }).click();
  const submitted = await creationRequest;
  await expect(page).toHaveURL(/\/portal\/requests\/AV-[A-F0-9]{12}$/u);
  const requestId = decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1)!);
  await expect(page.getByRole('status', { name: 'Статус интеграции Jira' })).toContainText(
    'Ожидает передачи',
  );

  const idempotencyKey = submitted.headers()['idempotency-key'];
  const requestBody = submitted.postData();
  expect(idempotencyKey).toBeTruthy();
  expect(requestBody).toBeTruthy();
  const replay = await page.evaluate(
    async ({ key, body }) => {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body,
      });
      return { status: response.status, body: await response.json() };
    },
    { key: idempotencyKey!, body: requestBody! },
  );
  expect(replay.status).toBe(201);
  expect((replay.body as { request: { id: string } }).request.id).toBe(requestId);

  const worker = await page.evaluate(async () => {
    const response = await fetch('/api/internal/test/jira-worker', { method: 'POST' });
    return { status: response.status, body: await response.json() };
  });
  expect(worker.status).toBe(200);
  expect((worker.body as { summary: { completed: number } }).summary.completed).toBe(1);

  await page.reload();
  await expect(page.getByRole('status', { name: 'Статус интеграции Jira' })).toContainText(
    'Задача создана',
  );
  await expect(page.getByRole('link', { name: /Открыть TEST-[0-9]+ в Jira/u })).toBeVisible();
  await runAxe('jira-request-created');

  await page.context().clearCookies();
  await loginAs('tenantB');
  allowApiFailure('GET', `/api/requests/${requestId}`, 404);
  const foreignResponse = await page.request.get(`/api/requests/${requestId}`);
  expect(foreignResponse.status()).toBe(404);
  await assertNoBrowserErrors();
});

test('Jira request form remains usable on responsive projects @responsive', async ({
  page,
  loginAs,
  runAxe,
  assertNoBrowserErrors,
}) => {
  await loginAs('tenantA');
  await page.goto('/portal/requests/new');
  await expect(page.getByLabel('Тема')).toBeVisible();
  await expect(page.getByLabel('Описание')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Создать обращение' })).toBeVisible();
  await runAxe('jira-request-responsive');
  await assertNoBrowserErrors();
});

test('Jira status and public comments synchronize while private and duplicate events stay hidden', async ({
  page,
  loginAs,
  runAxe,
  allowApiFailure,
  assertNoBrowserErrors,
}) => {
  await loginAs('tenantA');
  await page.goto('/portal/requests/new');
  await page.getByLabel('Тема').fill('Browser Jira synchronization');
  await page.getByLabel('Категория').selectOption({ label: 'Интеграция' });
  await page.getByLabel('Описание').fill('Synthetic TASK-017 browser synchronization flow.');
  await page.getByRole('button', { name: 'Создать обращение' }).click();
  await expect(page).toHaveURL(/\/portal\/requests\/AV-[A-F0-9]{12}$/u);
  const requestId = decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1)!);

  let worker = await page.evaluate(async () => {
    const response = await fetch('/api/internal/test/jira-worker', { method: 'POST' });
    return { status: response.status, body: await response.json() };
  });
  expect(worker.status).toBe(200);
  await page.reload();

  const statusTimestamp = Date.now();
  const statusEvent = await page.evaluate(
    async ({ id, timestamp }) => {
      const response = await fetch('/api/internal/test/jira-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: id,
          type: 'status',
          statusName: 'Waiting for customer',
          timestamp,
        }),
      });
      return { status: response.status, body: await response.json() };
    },
    { id: requestId, timestamp: statusTimestamp },
  );
  expect(statusEvent.status).toBe(202);
  const duplicateStatus = await page.evaluate(
    async ({ eventId, timestamp }) => {
      const response = await fetch('/api/internal/test/jira-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: eventId,
          type: 'status',
          statusName: 'Waiting for customer',
          timestamp,
        }),
      });
      return response.status;
    },
    { eventId: requestId, timestamp: statusTimestamp },
  );
  expect(duplicateStatus).toBe(202);
  const publicCommentId = `browser-public-${crypto.randomUUID()}`;
  const privateCommentId = `browser-private-${crypto.randomUUID()}`;
  for (const comment of [
    { commentId: publicCommentId, commentBody: 'Public Jira browser comment', public: true },
    { commentId: privateCommentId, commentBody: 'Private Jira browser comment', public: false },
  ]) {
    const response = await page.evaluate(
      async ({ requestId: id, ...body }) => {
        const result = await fetch('/api/internal/test/jira-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: id, type: 'comment', ...body }),
        });
        return result.status;
      },
      { requestId, ...comment },
    );
    expect(response).toBe(202);
  }
  worker = await page.evaluate(async () => {
    const response = await fetch('/api/internal/test/jira-worker', { method: 'POST' });
    return { status: response.status, body: await response.json() };
  });
  expect(worker.status).toBe(200);
  await page.reload();
  await expect(page.getByText('Нужно уточнение', { exact: true })).toBeVisible();
  await expect(page.getByText('Public Jira browser comment')).toHaveCount(1);
  await expect(page.getByText('Private Jira browser comment')).toHaveCount(0);

  await page.getByLabel('Комментарий').fill('Customer browser comment to Jira');
  await page.getByRole('button', { name: 'Добавить сообщение' }).click();
  await expect(page.getByText('Ожидает отправки в Jira')).toBeVisible();
  worker = await page.evaluate(async () => {
    const response = await fetch('/api/internal/test/jira-worker', { method: 'POST' });
    return { status: response.status, body: await response.json() };
  });
  expect(worker.status).toBe(200);
  await page.reload();
  await expect(page.getByText('Customer browser comment to Jira')).toHaveCount(1);
  await expect(page.getByText('Отправлено в Jira')).toBeVisible();
  await runAxe('jira-sync-request-detail');

  await page.context().clearCookies();
  await loginAs('tenantB');
  allowApiFailure('GET', `/api/requests/${requestId}`, 404);
  expect((await page.request.get(`/api/requests/${requestId}`)).status()).toBe(404);
  await assertNoBrowserErrors();
});
