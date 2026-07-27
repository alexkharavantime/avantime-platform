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

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return undefined;
  }
}
