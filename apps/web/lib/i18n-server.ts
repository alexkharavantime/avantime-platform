import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import {
  isLocale,
  localeCookieName,
  localeFromAcceptLanguage,
  type Locale,
} from './i18n';

export async function getLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  const requestLocale = requestHeaders.get('x-avantime-locale');
  if (isLocale(requestLocale)) return requestLocale;
  const savedLocale = (await cookies()).get(localeCookieName)?.value;
  if (isLocale(savedLocale)) return savedLocale;
  return localeFromAcceptLanguage(requestHeaders.get('accept-language')) ?? 'lv';
}

export async function getOriginalPath() {
  return (await headers()).get('x-avantime-original-path') ?? '/';
}