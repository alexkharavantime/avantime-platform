// Black-box check of the Strapi CMS pilot through the public HTTPS edge (DEV/staging, after deploy).
// Reads no secrets. Usage:
//   npm run cms:pilot-check -w @avantime/web -- --site https://<site-host> --cms https://<cms-host>
//     [--expect lv=200,ru=200,en=404] [--ca <root.crt>] [--resolve <ip>]
// --resolve sends every request to that address (e.g. 127.0.0.1 before DNS exists); TLS still
// verifies the host name. --ca adds a trusted root (Caddy `tls internal`).
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';

import { cmsProductPagePath } from '../lib/cms-product-page-routes';
import { locales, type Locale } from '../lib/i18n';

type Options = {
  site: URL;
  cms: URL;
  expect: Record<Locale, 200 | 404>;
  ca?: Buffer;
  resolve?: string;
};
type Response = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
};

function parseOptions(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const site = value('site');
  const cms = value('cms');
  if (!site || !cms) throw new Error('usage: --site <https origin> --cms <https origin>');
  const expect = Object.fromEntries(locales.map((locale) => [locale, 200])) as Options['expect'];
  for (const pair of (value('expect') ?? '').split(',').filter(Boolean)) {
    const [locale, status] = pair.split('=');
    if (!locales.includes(locale as Locale) || (status !== '200' && status !== '404')) {
      throw new Error(`invalid --expect entry: ${pair}`);
    }
    expect[locale as Locale] = Number(status) as 200 | 404;
  }
  const ca = value('ca');
  return {
    site: new URL(site),
    cms: new URL(cms),
    expect,
    ca: ca ? readFileSync(ca) : undefined,
    resolve: value('resolve'),
  };
}

function fixedLookup(address: string | undefined): LookupFunction | undefined {
  if (!address) return undefined;
  const family = address.includes(':') ? 6 : 4;
  return (_hostname, lookupOptions, callback) => {
    if (lookupOptions.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

function request(
  options: Options,
  url: URL,
  init: { method?: string; body?: string } = {},
): Promise<Response> {
  const lookup = fixedLookup(options.resolve);
  return new Promise((resolve, reject) => {
    const outgoing = https.request(
      url,
      {
        method: init.method ?? 'GET',
        headers: init.body ? { 'content-type': 'application/json' } : {},
        ca: options.ca,
        lookup,
        timeout: 20_000,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () =>
          resolve({
            status: incoming.statusCode ?? 0,
            headers: incoming.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    outgoing.on('timeout', () => outgoing.destroy(new Error('timeout')));
    outgoing.on('error', reject);
    outgoing.end(init.body);
  });
}

const decode = (value: string) => value.replaceAll('&amp;', '&');
const attribute = (tag: string, name: string) =>
  new RegExp(`\\s${name}="([^"]*)"`, 'iu').exec(tag)?.[1];

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const failures: string[] = [];
  const check = (passed: boolean, message: string) => {
    console.info(`${passed ? 'ok  ' : 'FAIL'} ${message}`);
    if (!passed) failures.push(message);
  };
  const published = locales.filter((locale) => options.expect[locale] === 200);

  for (const locale of locales) {
    const pageUrl = new URL(cmsProductPagePath('accounting', locale), options.site);
    const page = await request(options, pageUrl);
    const html = page.body.toString('utf8');
    const expected = options.expect[locale];
    check(
      page.status === expected,
      `${locale} page ${pageUrl.pathname} → ${page.status} (expected ${expected})`,
    );
    console.info(`     cache-control: ${String(page.headers['cache-control'] ?? '-')}`);
    const links = html.match(/<link [^>]*>/giu) ?? [];
    const robots = /<meta name="robots" content="([^"]*)"/iu.exec(html)?.[1] ?? '';

    if (expected === 404) {
      check(/noindex/iu.test(robots), `${locale} withdrawn page is noindex`);
      check(
        !links.some((tag) => /rel="alternate"/iu.test(tag) && attribute(tag, 'hrefLang')),
        `${locale} withdrawn page has no hreflang`,
      );
      continue;
    }
    const title = /<title>([^<]*)<\/title>/iu.exec(html)?.[1] ?? '';
    const description = /<meta name="description" content="([^"]*)"/iu.exec(html)?.[1] ?? '';
    check(
      title.trim().length > 0 && description.trim().length > 0,
      `${locale} title and description present ("${title}")`,
    );
    check(!/noindex/iu.test(robots), `${locale} published page is indexable`);
    const canonical = links.find((tag) => /rel="canonical"/iu.test(tag));
    check(
      canonical !== undefined && attribute(canonical, 'href') === pageUrl.toString(),
      `${locale} canonical = ${canonical ? attribute(canonical, 'href') : 'missing'}`,
    );
    const alternates = links
      .filter((tag) => /rel="alternate"/iu.test(tag) && attribute(tag, 'hrefLang'))
      .map((tag) => attribute(tag, 'hrefLang')!)
      .sort();
    const expectedAlternates = [
      ...published,
      ...(published.includes('lv') ? ['x-default'] : []),
    ].sort();
    check(
      alternates.join(',') === expectedAlternates.join(','),
      `${locale} hreflang [${alternates.join(', ')}] (expected [${expectedAlternates.join(', ')}])`,
    );
    const imagePath = /(\/_next\/image\?url=[^"\s]+)/u.exec(html)?.[1];
    const imageUrl = imagePath ? new URL(decode(imagePath), options.site) : null;
    const source = imageUrl?.searchParams.get('url') ?? '';
    check(
      source.startsWith(`${options.cms.origin}/uploads/`),
      `${locale} image source is CMS media (${source || 'missing'})`,
    );
    if (imageUrl) {
      const image = await request(options, imageUrl);
      check(
        image.status === 200 &&
          String(image.headers['content-type']).startsWith('image/') &&
          image.body.length > 0,
        `${locale} optimized image → ${image.status} ${String(image.headers['content-type'])} ${image.body.length} B`,
      );
    }
  }

  const health = await request(options, new URL('/_health', options.cms));
  check(health.status === 204, `CMS /_health → ${health.status}`);
  const anonymous = await request(options, new URL('/api/product-pages', options.cms));
  check(
    anonymous.status === 401 || anonymous.status === 403,
    `CMS API without token → ${anonymous.status}`,
  );
  const admin = await request(options, new URL('/admin', options.cms));
  check(
    admin.status === 200 || admin.status === 403,
    `CMS /admin → ${admin.status} (403 = outside STAGING_CMS_ALLOWED_CLIENTS)`,
  );
  const webhook = await request(options, new URL('/api/cms/revalidate', options.site), {
    method: 'POST',
    body: '{}',
  });
  check(
    webhook.status === 404,
    `public POST /api/cms/revalidate → ${webhook.status} (blocked at the edge)`,
  );
  const redirect = await new Promise<number>((resolve) => {
    const plain = new URL(options.site);
    plain.protocol = 'http:';
    plain.port = '';
    const outgoing = http.request(
      plain,
      { lookup: fixedLookup(options.resolve), timeout: 10_000 },
      (incoming) => {
        incoming.resume();
        resolve(incoming.statusCode ?? 0);
      },
    );
    outgoing.on('timeout', () => outgoing.destroy(new Error('timeout')));
    outgoing.on('error', () => resolve(0));
    outgoing.end();
  });
  check(redirect === 308 || redirect === 301, `http:// site → ${redirect} (redirect to HTTPS)`);

  if (failures.length) {
    console.error(`${failures.length} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.info('all checks passed');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'CMS_PILOT_CHECK_FAILED');
  process.exitCode = 1;
});
