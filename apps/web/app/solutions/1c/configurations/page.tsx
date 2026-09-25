import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { PageShell } from '../../../../components/page-shell';
import { solutions } from '../../../../lib/content';
import { localePath } from '../../../../lib/i18n';
import { getLocale } from '../../../../lib/i18n-server';
import { getLocalizedSolution } from '../../../../lib/solution-localization';
import { getSectionCardImage, type SectionImageId } from '../../../../lib/section-images';
import { getProductContent } from '../../../../lib/product-content';

const configurationSlugs = [
  'platform-1c-predpriyatie',
  'ut-1-3',
  'buhgalteriya-predpriyatiya',
  'upravlenie-proizvodstvennym-predpriyatiem',
  'adresny-sklad',
] as const;

const copy = {
  ru: { title: 'Конфигурации 1С', description: 'Выберите конфигурацию, которая соответствует задачам вашей компании.', back: '← Назад к обзору 1С', open: 'Открыть конфигурацию →' },
  en: { title: '1C configurations', description: 'Choose the configuration that matches your company’s needs.', back: '← Back to 1C overview', open: 'Open configuration →' },
  lv: { title: '1C konfigurācijas', description: 'Izvēlieties konfigurāciju, kas atbilst jūsu uzņēmuma uzdevumiem.', back: '← Atpakaļ uz 1C pārskatu', open: 'Atvērt konfigurāciju →' },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: `${copy[locale].title} — Avantime`, description: copy[locale].description };
}

export default async function ConfigurationsPage() {
  const locale = await getLocale();
  const text = copy[locale];
  const items = configurationSlugs
    .map((slug) => solutions.find((solution) => solution.slug === slug))
    .filter((solution): solution is (typeof solutions)[number] => Boolean(solution))
    .map((solution) => {
      const productId = {
        'platform-1c-predpriyatie': 'platform',
        'buhgalteriya-predpriyatiya': 'accounting',
        'upravlenie-proizvodstvennym-predpriyatiem': 'manufacturing',
        'adresny-sklad': 'addressed-warehouse',
      }[solution.slug];
      const localized = getLocalizedSolution(solution, locale);
      if (!productId) return localized;
      const prepared = getProductContent(locale, productId);
      return { ...localized, title: prepared.name, shortTitle: prepared.name, summary: prepared.cardText };
    });
  const imageIds: Record<string, SectionImageId> = {
    'platform-1c-predpriyatie': 'platform',
    'ut-1-3': 'onec',
    'buhgalteriya-predpriyatiya': 'accounting',
    'upravlenie-proizvodstvennym-predpriyatiem': 'manufacturing',
    'adresny-sklad': 'addressed-warehouse',
  };

  return (
    <PageShell>
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <Link href={localePath(locale, '/solutions/1c')} className="text-sm font-bold text-blue-600 transition hover:text-blue-800">
            {text.back}
          </Link>
          <h1 className="mt-10 max-w-4xl text-5xl font-black tracking-[-0.045em] sm:text-7xl">{text.title}</h1>
          <p className="mt-7 max-w-3xl text-xl leading-9 text-slate-600">{text.description}</p>
        </div>
      </section>
      <section className="py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-2">
          {items.map((item) => (
            <article key={item.slug} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <Image
                src={getSectionCardImage(imageIds[item.slug], locale).src}
                alt={getSectionCardImage(imageIds[item.slug], locale).alt}
                width={768}
                height={384}
                sizes="(max-width: 768px) 100vw, 50vw"
                className="h-auto w-full rounded-2xl border border-slate-200 object-contain"
              />
              <h2 className="mt-5 text-3xl font-black tracking-tight">{item.title}</h2>
              <p className="mt-4 leading-7 text-slate-600">{item.summary}</p>
              <Link href={localePath(locale, `/solutions/${item.slug}`)} className="mt-7 inline-flex font-black text-blue-600">
                {text.open}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
