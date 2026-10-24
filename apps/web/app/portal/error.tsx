'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isLocale, localeFromPathname, type Locale } from '../../lib/i18n';

const copy: Record<Locale, { eyebrow: string; title: string; description: string; retry: string }> = {
  lv: { eyebrow: 'Kļūda', title: 'Sadaļa īslaicīgi nav pieejama', description: 'Mēģiniet vēlreiz. Ja kļūda atkārtojas, informējiet atbalstu par notikuma laiku.', retry: 'Mēģināt vēlreiz' },
  ru: { eyebrow: 'Ошибка', title: 'Раздел временно недоступен', description: 'Повторите попытку. Если ошибка сохраняется, сообщите поддержке время события.', retry: 'Повторить' },
  en: { eyebrow: 'Error', title: 'This section is temporarily unavailable', description: 'Please try again. If the problem continues, tell support when it occurred.', retry: 'Try again' },
};

export default function PortalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>(() => localeFromPathname(pathname));
  useEffect(() => {
    const documentLocale = document.documentElement.lang;
    if (isLocale(documentLocale)) setLocale(documentLocale);
  }, []);
  const text = copy[locale];
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-black uppercase tracking-widest text-red-700">{text.eyebrow}</p>
      <h1 className="mt-3 text-3xl font-black">{text.title}</h1>
      <p className="mt-3 text-slate-600">{text.description}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
      >
        {text.retry}
      </button>
    </div>
  );
}
