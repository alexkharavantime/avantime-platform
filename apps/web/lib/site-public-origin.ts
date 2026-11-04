import { isIP } from 'node:net';

type Environment = Record<string, string | undefined>;

export type SitePublicOriginProblem =
  'missing' | 'invalid' | 'not_origin' | 'not_https' | 'local_host' | 'staging_host';

function isLocalHost(hostname: string) {
  const ip = isIP(hostname.replace(/^\[|\]$/gu, ''));
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.invalid') ||
    !hostname.includes('.') ||
    ip !== 0
  );
}

/**
 * The public origin of the site (canonical and hreflang URLs) is AUTH_PUBLIC_ORIGIN, the origin
 * the site and the portal are served from. It is never taken from the request's Host header.
 * Production (NODE_ENV=production without APP_ENV=staging) accepts only a public HTTPS origin
 * that is not a staging host; staging accepts any HTTPS origin; development also accepts HTTP.
 */
export function checkSitePublicOrigin(
  environment: Environment = process.env,
): { origin: URL; problem?: never } | { origin?: never; problem: SitePublicOriginProblem } {
  const value = environment.AUTH_PUBLIC_ORIGIN?.trim();
  if (!value) return { problem: 'missing' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { problem: 'invalid' };
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    value.replace(/\/$/u, '') !== url.origin
  ) {
    return { problem: 'not_origin' };
  }
  const runtimeProduction = environment.NODE_ENV === 'production';
  if (url.protocol !== 'https:' && (runtimeProduction || url.protocol !== 'http:')) {
    return { problem: 'not_https' };
  }
  if (runtimeProduction && environment.APP_ENV !== 'staging') {
    const hostname = url.hostname.toLowerCase();
    if (isLocalHost(hostname)) return { problem: 'local_host' };
    if (hostname.split(/[.-]/u).includes('staging')) return { problem: 'staging_host' };
  }
  return { origin: new URL(url.origin) };
}

let reportedProblem: SitePublicOriginProblem | undefined;

/** The checked origin, or null (relative URLs) when the configuration is missing or rejected. */
export function sitePublicOrigin(environment: Environment = process.env) {
  const result = checkSitePublicOrigin(environment);
  if (
    result.problem &&
    environment.NODE_ENV === 'production' &&
    reportedProblem !== result.problem
  ) {
    reportedProblem = result.problem;
    console.warn(JSON.stringify({ event: 'site.public_origin.rejected', reason: result.problem }));
  }
  return result.origin ?? null;
}
