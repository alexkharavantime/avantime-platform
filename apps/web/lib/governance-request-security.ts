export function governanceMutationOriginAllowed(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const expected = process.env.AUTH_PUBLIC_ORIGIN?.trim() || new URL(request.url).origin;
    if (new URL(origin).origin !== new URL(expected).origin) return false;
    const fetchSite = request.headers.get('sec-fetch-site');
    return !fetchSite || fetchSite === 'same-origin';
  } catch {
    return false;
  }
}
