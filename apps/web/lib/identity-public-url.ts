const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isUsableBaseUrl(value: string, production: boolean) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || (!production && url.protocol === 'http:')) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (!production || !LOCAL_HOSTS.has(url.hostname))
    );
  } catch {
    return false;
  }
}

export function identityPublicUrl(path: string, requestUrl: string) {
  const production = process.env.NODE_ENV === 'production';
  const candidates = production
    ? [process.env.IDENTITY_PUBLIC_BASE_URL, process.env.AUTH_PUBLIC_ORIGIN, process.env.APP_URL]
    : [process.env.IDENTITY_PUBLIC_BASE_URL, process.env.APP_URL, process.env.AUTH_PUBLIC_ORIGIN];
  const configured = candidates.find(
    (candidate) => candidate?.trim() && isUsableBaseUrl(candidate.trim(), production),
  );
  const baseUrl = configured?.trim() ?? (!production ? new URL(requestUrl).origin : null);
  if (!baseUrl) throw new Error('IDENTITY_PUBLIC_BASE_URL_REQUIRED');
  return new URL(path, baseUrl);
}