import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Response, type TestInfo } from '@playwright/test';
import path from 'node:path';

import { browserIdentities } from './environment';
import {
  createBrowserTestClientIp,
  browserTestRun,
  browserTestShard,
} from './test-client-ip';

type BrowserIdentity = keyof typeof browserIdentities;

type Diagnostic = {
  kind: 'console' | 'page-error' | 'request-failed' | 'server-error';
  message: string;
  method?: string;
  path?: string;
  status?: number;
};

type BrowserFixtures = {
  browserTestClientIp: string;
  browserRateLimitIsolation: void;
  diagnostics: Diagnostic[];
  loginAs: (identity: BrowserIdentity) => Promise<void>;
  allowApiFailure: (method: string, path: string, status: number, consume?: boolean) => boolean;
  assertNoBrowserErrors: () => Promise<void>;
  runAxe: (pageName: string) => Promise<void>;
};

function safeMessage(value: string) {
  return value
    .replace(/https?:\/\/[^/\s]+([^?\s]*)\?[^\s]*/g, '$1?[REDACTED]')
    .replace(/browser-[a-z0-9-]+-password/giu, '[REDACTED]')
    .slice(0, 2_000);
}

function safePath(value: string) {
  try {
    return new URL(value).pathname;
  } catch {
    return '/invalid-url';
  }
}

async function attachDiagnostics(testInfo: TestInfo, diagnostics: Diagnostic[]) {
  if (diagnostics.length === 0) return;
  await testInfo.attach('browser-diagnostics', {
    body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
    contentType: 'application/json',
  });
}

async function safeLoginError(response: Response) {
  let code: string | null = null;
  let message: string | null = null;
  try {
    const body = (await response.json()) as unknown;
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const record = body as Record<string, unknown>;
      if (typeof record.code === 'string' && /^[A-Z0-9_.-]{1,100}$/iu.test(record.code)) {
        code = record.code;
      }
      const candidate =
        typeof record.error === 'string'
          ? record.error
          : typeof record.message === 'string'
            ? record.message
            : null;
      if (candidate) message = safeMessage(candidate);
    }
  } catch {
    message = 'Response did not contain a JSON error object.';
  }
  const url = new URL(response.url());
  return {
    code,
    message,
    status: response.status(),
    url: `${url.origin}${url.pathname}`,
  };
}

export const test = base.extend<BrowserFixtures>({
  browserTestClientIp: async ({}, provide, testInfo) => {
    await provide(
      createBrowserTestClientIp({
        project: testInfo.project.name,
        file: path.relative(process.cwd(), testInfo.file),
        titlePath: testInfo.titlePath,
        retry: testInfo.retry,
        repeatEachIndex: testInfo.repeatEachIndex,
        workerIndex: testInfo.workerIndex,
        parallelIndex: testInfo.parallelIndex,
        shard: browserTestShard(),
        run: browserTestRun(),
      }),
    );
  },

  browserRateLimitIsolation: [
    async ({ context, browserTestClientIp }, provide) => {
      await context.setExtraHTTPHeaders({ 'x-forwarded-for': browserTestClientIp });
      await provide();
    },
    { auto: true },
  ],

  diagnostics: async ({ page, allowApiFailure }, provide, testInfo) => {
    const diagnostics: Diagnostic[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        diagnostics.push({ kind: 'console', message: safeMessage(message.text()) });
      }
    });
    page.on('pageerror', (error) => {
      diagnostics.push({ kind: 'page-error', message: safeMessage(error.message) });
    });
    page.on('requestfailed', (request) => {
      const path = safePath(request.url());
      if (request.failure()?.errorText === 'net::ERR_ABORTED' && request.method() === 'GET') {
        return;
      }
      diagnostics.push({
        kind: 'request-failed',
        message: safeMessage(request.failure()?.errorText ?? 'request failed'),
        method: request.method(),
        path,
      });
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (
        response.status() >= 400 &&
        url.origin === 'http://127.0.0.1:3410' &&
        url.pathname.startsWith('/api/') &&
        !allowApiFailure(response.request().method(), url.pathname, response.status(), true)
      ) {
        diagnostics.push({
          kind: 'server-error',
          message: 'Same-origin API response failed.',
          method: response.request().method(),
          path: url.pathname,
          status: response.status(),
        });
      }
    });
    await provide(diagnostics);
    if (testInfo.status !== testInfo.expectedStatus) {
      await attachDiagnostics(testInfo, diagnostics);
    }
  },

  allowApiFailure: async ({}, provide) => {
    const allowed = new Set<string>();
    await provide((method, path, status, consume = false) => {
      const key = `${method.toUpperCase()} ${path} ${status}`;
      if (consume) {
        if (!allowed.has(key)) return false;
        allowed.delete(key);
        return true;
      }
      allowed.add(key);
      return true;
    });
  },

  loginAs: async ({ page, browserTestClientIp }, provide, testInfo) => {
    await provide(async (identity) => {
      const credentials = browserIdentities[identity];
      const targetPath =
        identity === 'admin' || identity === 'identityAdmin' ? '/admin' : '/portal';
      await page.goto('/portal/login');
      await page.getByLabel('Email').fill(credentials.email);
      await page.getByLabel('Пароль').fill(credentials.password);
      const loginResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/auth/login' &&
          response.request().method() === 'POST',
      );
      const targetPage = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === targetPath &&
          response.request().isNavigationRequest() &&
          response.ok(),
        { timeout: 50_000 },
      );
      void targetPage.catch(() => undefined);
      await page.getByRole('button', { name: 'Войти' }).click();
      const response = await loginResponse;
      if (!response.ok()) {
        const failure = {
          ...(await safeLoginError(response)),
          assignedTestClientIp: browserTestClientIp,
          project: testInfo.project.name,
          testPath: path.relative(process.cwd(), testInfo.file),
          retry: testInfo.retry,
          workerIndex: testInfo.workerIndex,
          parallelIndex: testInfo.parallelIndex,
        };
        await testInfo.attach('login-failure', {
          body: Buffer.from(JSON.stringify(failure, null, 2)),
          contentType: 'application/json',
        });
        throw new Error(`Browser login failed: ${JSON.stringify(failure)}`);
      }
      await targetPage;
      await expect(page).toHaveURL(new RegExp(`${targetPath.replace('/', '\\/')}$`, 'u'));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  },

  assertNoBrowserErrors: async ({ diagnostics }, provide) => {
    await provide(async () => {
      expect(diagnostics, 'Browser console, page, network and server errors').toEqual([]);
    });
  },

  runAxe: async ({ page }, provide, testInfo) => {
    await provide(async (pageName) => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      await testInfo.attach(`axe-${pageName}`, {
        body: Buffer.from(JSON.stringify(results, null, 2)),
        contentType: 'application/json',
      });
      const blocking = results.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      );
      expect(blocking, `Critical/serious axe findings on ${pageName}`).toEqual([]);
    });
  },
});

export { expect };
