export type CompatibilitySearchParams = Record<string, string | string[] | undefined>;

export function appendCompatibilitySearchParams(
  pathname: string,
  searchParams: CompatibilitySearchParams = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
