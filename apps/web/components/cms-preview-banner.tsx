import type { Locale } from '../lib/i18n';

const copy = {
  lv: { label: 'Melnraksta priekšskatījums — apmeklētāji šo versiju neredz.', exit: 'Iziet no priekšskatījuma' },
  ru: { label: 'Предпросмотр черновика — посетители эту версию не видят.', exit: 'Выйти из предпросмотра' },
  en: { label: 'Draft preview — visitors do not see this version.', exit: 'Exit preview' },
} as const;

export function CmsPreviewBanner({ locale, cmsKey }: { locale: Locale; cmsKey: string }) {
  const text = copy[locale];
  return (
    <div role="status" className="sticky top-0 z-50 bg-amber-400 px-6 py-3 text-sm font-black text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <span>{text.label}</span>
        {/* A plain link: the exit route must run on the server to clear the draft cookie. */}
        <a className="underline" href={`/api/cms/preview/exit?key=${encodeURIComponent(cmsKey)}&locale=${locale}`}>
          {text.exit}
        </a>
      </div>
    </div>
  );
}
