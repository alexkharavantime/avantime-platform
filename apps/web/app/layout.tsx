import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Avantime — автоматизация бизнеса с AI и 1С',
  description:
    'Внедрение 1С, искусственный интеллект, Agent+, облачные решения, интеграции и электронный документооборот.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
