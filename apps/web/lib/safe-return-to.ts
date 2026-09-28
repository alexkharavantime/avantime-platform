import { stripLocale } from './i18n';
import { isPortalPublicPath } from './portal-public-paths';

const LOCAL_ORIGIN = 'https://avantime.local';

export function safeReturnTo(value?: string): string | undefined {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return undefined;
  }

  try {
    const target = new URL(value, LOCAL_ORIGIN);
    if (target.origin !== LOCAL_ORIGIN) {
      return undefined;
    }
    // The login page itself must never become its own return target (prevents nested returnTo loops).
    if (isPortalPublicPath(stripLocale(target.pathname))) {
      return undefined;
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return undefined;
  }
}
