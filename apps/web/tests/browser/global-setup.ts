import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { BROWSER_BASE_URL, browserIdentities } from './environment';

// `next dev` compiles each route on first request, and the HMR refresh it then sends can cancel a
// client navigation in flight. Compiling every page and API route before the tests avoids that race.
const appDirectory =
  path.basename(process.cwd()) === 'web'
    ? path.join(process.cwd(), 'app')
    : path.resolve(process.cwd(), 'apps/web/app');
const routeFiles = new Set(['page.tsx', 'page.ts', 'route.ts', 'route.tsx']);

async function collectRoutes(directory: string, segments: string[]): Promise<string[]> {
  const routes: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && routeFiles.has(entry.name)) {
      routes.push(`/${segments.join('/')}`);
      continue;
    }
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('@')) continue;
    const segment = /^\(.*\)$/u.test(entry.name)
      ? undefined
      : entry.name.startsWith('[')
        ? 'warmup'
        : entry.name;
    routes.push(
      ...(await collectRoutes(
        path.join(directory, entry.name),
        segment ? [...segments, segment] : segments,
      )),
    );
  }
  return routes;
}

async function warm(route: string, headers: Record<string, string> = {}) {
  try {
    return await fetch(new URL(route, BROWSER_BASE_URL), {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(180_000),
    });
  } catch {
    // A route that fails to answer is still compiled; the tests report real failures.
    return null;
  }
}

// Protected pages answer an anonymous request with a middleware redirect before their module is
// compiled, so they are requested once more with a short-lived session of a regular client.
async function warmProtectedPages(routes: string[]) {
  const headers = {
    origin: BROWSER_BASE_URL,
    'content-type': 'application/json',
    // Own documentation-range address: the warm-up does not consume the tests' login rate limits.
    'x-forwarded-for': '2001:db8:ffff::1',
  };
  const credentials = browserIdentities.tenantA;
  const login = await fetch(new URL('/api/auth/login', BROWSER_BASE_URL), {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    redirect: 'manual',
    signal: AbortSignal.timeout(180_000),
  });
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  if (!login.ok || !cookie)
    throw new Error(`Browser warm-up login failed with HTTP ${login.status}.`);
  try {
    for (const route of routes)
      await warm(route, { cookie, 'x-forwarded-for': headers['x-forwarded-for'] });
  } finally {
    await fetch(new URL('/api/auth/logout', BROWSER_BASE_URL), {
      method: 'POST',
      headers: { ...headers, cookie },
      redirect: 'manual',
    }).catch(() => undefined);
  }
}

export default async function globalSetup() {
  const routes = [...new Set(await collectRoutes(appDirectory, []))].sort();
  const startedAt = Date.now();
  const redirectedToLogin: string[] = [];
  for (const route of routes) {
    const response = await warm(route);
    const location = response?.headers.get('location') ?? '';
    if (
      response &&
      response.status >= 300 &&
      response.status < 400 &&
      location.includes('/portal/login')
    ) {
      redirectedToLogin.push(route);
    }
  }
  if (redirectedToLogin.length) await warmProtectedPages(redirectedToLogin);
  console.log(
    `Browser warm-up compiled ${routes.length} routes (${redirectedToLogin.length} behind login) in ${Math.round((Date.now() - startedAt) / 1000)}s.`,
  );
}
