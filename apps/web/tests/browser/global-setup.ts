import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { BROWSER_BASE_URL } from './environment';

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

export default async function globalSetup() {
  const routes = [...new Set(await collectRoutes(appDirectory, []))].sort();
  const startedAt = Date.now();
  for (const route of routes) {
    try {
      await fetch(new URL(route, BROWSER_BASE_URL), {
        redirect: 'manual',
        signal: AbortSignal.timeout(180_000),
      });
    } catch {
      // A route that fails to answer is still compiled; the tests report real failures.
    }
  }
  console.log(
    `Browser warm-up compiled ${routes.length} routes in ${Math.round((Date.now() - startedAt) / 1000)}s.`,
  );
}
