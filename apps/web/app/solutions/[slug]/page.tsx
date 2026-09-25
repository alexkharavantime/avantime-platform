import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '../../../components/page-shell';
import { solutions } from '../../../lib/content';
import { getLocale } from '../../../lib/i18n-server';
import { getLocalizedSolution } from '../../../lib/solution-localization';
import { localePath } from '../../../lib/i18n';
import { getSectionImage, type SectionImageId } from '../../../lib/section-images';
import { getProductContent } from '../../../lib/product-content';

type Props = { params: Promise<{ slug: string }> };
const pageCopy = {
  lv: { result: 'Rezultāts', business: 'Ko iegūst uzņēmums', next: 'Nākamais solis', discuss: 'Pārrunāsim uzdevumu un pirmā posma robežas', contact: 'Sazināties ar Avantime' },
  ru: { result: 'Результат', business: 'Что получает бизнес', next: 'Следующий шаг', discuss: 'Обсудим задачу и границы первого этапа', contact: 'Связаться с Avantime' },
  en: { result: 'Outcome', business: 'What the business gets', next: 'Next step', discuss: 'Let’s discuss the task and the first stage', contact: 'Contact Avantime' },
} as const;
export function generateStaticParams() {
  return solutions.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = solutions.find((solution) => solution.slug === slug);
  const locale = await getLocale();
  const localized = item ? getLocalizedSolution(item, locale) : null;
  const productId = slug === 'buhgalteriya-predpriyatiya'
    ? 'accounting'
    : slug === 'upravlenie-proizvodstvennym-predpriyatiem'
      ? 'manufacturing'
      : slug === 'adresny-sklad'
        ? 'addressed-warehouse'
        : slug === 'platform-1c-predpriyatie'
          ? 'platform'
          : null;
  const prepared = productId ? getProductContent(locale, productId) : null;
  return localized ? { title: prepared?.seo.title ?? `${localized.title} — Avantime`, description: prepared?.seo.description ?? localized.summary } : {};
}

export default async function SolutionPage({ params }: Props) {
  const { slug } = await params;
  const item = solutions.find((solution) => solution.slug === slug);
  if (!item) notFound();
  const locale = await getLocale();
  const copy = pageCopy[locale];
  const localizedItem = getLocalizedSolution(item, locale);
  const productId = {
    'buhgalteriya-predpriyatiya': 'accounting',
    'upravlenie-proizvodstvennym-predpriyatiem': 'manufacturing',
    'adresny-sklad': 'addressed-warehouse',
    'platform-1c-predpriyatie': 'platform',
  }[localizedItem.slug];
  const prepared = productId ? getProductContent(locale, productId) : null;
  const displayTitle = prepared?.name ?? localizedItem.title;
  const imageId: SectionImageId = localizedItem.slug === '1c'
    ? 'onec'
    : localizedItem.slug === 'buhgalteriya-predpriyatiya'
      ? 'accounting'
      : localizedItem.slug === 'upravlenie-proizvodstvennym-predpriyatiem'
        ? 'manufacturing'
        : localizedItem.slug === 'adresny-sklad'
          ? 'addressed-warehouse'
          : localizedItem.slug === 'platform-1c-predpriyatie'
            ? 'platform'
          : localizedItem.slug as SectionImageId;
  const image = getSectionImage(imageId, locale);
  return (
    <PageShell>
      <section className="border-b border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <p className="mt-10 text-sm font-black tracking-[0.2em] text-blue-300">
            {localizedItem.number} · {prepared?.name ?? localizedItem.shortTitle}
          </p>
          <h1 className="mt-5 max-w-5xl text-5xl font-black tracking-[-0.045em] sm:text-7xl">
            {displayTitle}
          </h1>
          <p className="mt-7 max-w-3xl text-xl leading-9 text-slate-300">{prepared?.lead ?? localizedItem.description}</p>
        </div>
      </section>
      <section className="border-b border-slate-200 bg-white py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-6">
          <Image
            src={image.src}
            alt={image.alt}
            width={1774}
            height={887}
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="h-auto w-full rounded-3xl border border-slate-200 object-contain shadow-xl shadow-slate-950/10"
          />
        </div>
      </section>
      <section className="py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="eyebrow">{copy.result}</p>
            <h2 className="section-title mt-4">{copy.business}</h2>
            <div className="mt-8 space-y-3">
              {(prepared?.benefits.map((benefit) => benefit.title) ?? localizedItem.outcomes).map((outcome) => (
                <div key={outcome} className="rounded-2xl bg-blue-50 p-5 font-black text-blue-950">
                  ✓ {outcome}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {(prepared?.benefits ?? localizedItem.capabilities).map((capability, index) => (
              <article key={capability.title} className="rounded-3xl border border-slate-200 p-7">
                <span className="text-sm font-black text-blue-600">0{index + 1}</span>
                <h3 className="mt-5 text-2xl font-black">{capability.title}</h3>
                <p className="mt-4 leading-7 text-slate-600">{capability.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      {prepared && (
        <section className="bg-slate-50 py-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="eyebrow">{prepared.approachTitle}</p>
              <h2 className="section-title mt-4">{prepared.ctaText}</h2>
            </div>
            <p className="text-lg leading-8 text-slate-600">{prepared.approachText}</p>
          </div>
        </section>
      )}
      <section className="bg-blue-600 py-16 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-7 px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-black uppercase tracking-[0.18em] text-blue-100">{prepared ? prepared.ctaButton : copy.next}</p>
            <h2 className="mt-3 text-3xl font-black">{prepared?.ctaText ?? copy.discuss}</h2>
          </div>
          <Link
            href={localePath(locale, '/contacts')}
            className="inline-flex min-h-14 items-center justify-center rounded-full bg-white px-7 font-black text-blue-700"
          >
            {prepared?.ctaButton ?? copy.contact}
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
