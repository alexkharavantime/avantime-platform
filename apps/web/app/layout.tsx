import type { Metadata } from 'next';
import './globals.css';
import { defaultLocale, localePath, stripLocale } from '../lib/i18n';
import { getLocale, getOriginalPath } from '../lib/i18n-server';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const path = stripLocale(await getOriginalPath());
  const titles = {
    lv: 'Avantime — biznesa automatizācija ar 1C un AI',
    ru: 'Avantime — автоматизация бизнеса с AI и 1С',
    en: 'Avantime — business automation with 1C and AI',
  };
  const descriptions = {
    lv: '1C ieviešana, mākslīgais intelekts, integrācijas un praktiska biznesa automatizācija.',
    ru: 'Внедрение 1С, искусственный интеллект, интеграции и практическая автоматизация бизнеса.',
    en: '1C implementation, artificial intelligence, integrations and practical business automation.',
  };
  const localized = (candidate: typeof defaultLocale) => localePath(candidate, path);
  return {
    title: titles[locale],
    description: descriptions[locale],
    alternates: {
      canonical: localized(locale),
      languages: {
        lv: localized('lv'),
        ru: localized('ru'),
        en: localized('en'),
        'x-default': localized(defaultLocale),
      },
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
