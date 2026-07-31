import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type TestInfo } from '@playwright/test';

import { browserIdentities } from './environment';

type BrowserIdentity = keyof typeof browserIdentities;

type Diagnostic = {
  kind: 'console' | 'page-error' | 'request-failed' | 'server-error';
  message: string;
  method?: string;
  path?: string;
  status?: number;
};

type BrowserFixtures = {
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

export const test = base.extend<BrowserFixtures>({
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
      if (
        (request.isNavigationRequest() || request.headers().rsc === '1') &&
        request.failure()?.errorText === 'net::ERR_ABORTED'
      ) {
        return;
      }
      diagnostics.push({
        kind: 'request-failed',
        message: safeMessage(request.failure()?.errorText ?? 'request failed'),
        method: request.method(),
        path: safePath(request.url()),
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

  loginAs: async ({ page }, provide) => {
    await provide(async (identity) => {
      const credentials = browserIdentities[identity];
      const target =
        identity === 'admin' || identity === 'identityAdmin' ? /\/admin$/ : /\/portal$/;
      await page.goto('/portal/login');
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.getByLabel('Email').fill(credentials.email);
        await page.getByLabel('Пароль').fill(credentials.password);
        await page.getByRole('button', { name: 'Войти' }).click();
        try {
          await page.waitForURL(target, { timeout: 10_000 });
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          return;
        } catch (error) {
          if (attempt === 2) throw error;
        }
      }
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
