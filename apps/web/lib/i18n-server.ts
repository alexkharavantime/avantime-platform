import { headers } from 'next/headers';
import { defaultLocale, isLocale, type Locale } from './i18n';

export async function getLocale(): Promise<Locale> {
  const value = (await headers()).get('x-avantime-locale');
  return isLocale(value) ? value : defaultLocale;
}

export async function getOriginalPath() {
  return (await headers()).get('x-avantime-original-path') ?? '/';
}