import type { Metadata } from 'next';
import Image from 'next/image';
import { PageShell } from '../../components/page-shell';
import { solutions } from '../../lib/content';
import { getLocale } from '../../lib/i18n-server';
import { localePath } from '../../lib/i18n';
import { getLocalizedSolution } from '../../lib/solution-localization';
import { getSolutionCardImage, type SolutionCardImageId } from '../../lib/solution-card-images';

const pageCopy = {
  lv: { eyebrow: 'Avantime risinājumi', title: 'Vienota digitālā biznesa arhitektūra', description: 'Savienojam uzskaiti, darbinieku darbu, klientu attiecības un mākslīgo intelektu pārvaldāmā sistēmā.', more: 'Uzzināt vairāk →' },
  ru: { eyebrow: 'Решения Avantime', title: 'Единая архитектура цифрового бизнеса', description: 'Соединяем учет, работу сотрудников, взаимодействие с клиентами и искусственный интеллект в управляемую систему.', more: 'Подробнее →' },
  en: { eyebrow: 'Avantime solutions', title: 'One architecture for digital business', description: 'We connect accounting, employee workflows, customer interaction and artificial intelligence into a manageable system.', more: 'Learn more →' },
} as const;

const solutionOrder = [
  'ut-1-3',
  'buhgalteriya-predpriyatiya',
  'adresny-sklad',
  'upravlenie-proizvodstvennym-predpriyatiem',
  'agent-plus',
  'integrations',
  '1c',
  'cloud',
  'ai',
  'portals',
  'platform-1c-predpriyatie',
] as const;

export const metadata: Metadata = {
  title: 'Решения — Avantime',
  description: '1С, AI, Agent+, интеграции, облачная инфраструктура и клиентские порталы.',
};

export default async function SolutionsPage() {
  const locale = await getLocale();
  const localizedSolutions = solutionOrder
    .map((slug) => solutions.find((item) => item.slug === slug))
    .filter((item): item is (typeof solutions)[number] => Boolean(item))
    .map((item) => getLocalizedSolution(item, locale));
  const imageIds: Record<string, SolutionCardImageId> = {
    'ut-1-3': 'trade',
    'buhgalteriya-predpriyatiya': 'accounting',
    'adresny-sklad': 'warehouse',
    'upravlenie-proizvodstvennym-predpriyatiem': 'manufacturing',
    'agent-plus': 'mobile-sales',
    ai: 'ai',
    integrations: 'integrations',
    cloud: 'cloud',
    portals: 'portals',
    'platform-1c-predpriyatie': 'platform',
    '1c': 'implementation',
  };
  const copy = pageCopy[locale];

  return (
    <PageShell>
      <section className="border-b border-slate-200 bg-[linear-gradient(135deg,#f8fbff,#eef6ff,#f0fdfa)]">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-black tracking-[-0.045em] sm:text-7xl">{copy.title}</h1>
          <p className="mt-7 max-w-3xl text-xl leading-9 text-slate-600">{copy.description}</p>
        </div>
      </section>
      <section className="bg-slate-50 py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-2 lg:grid-cols-3">
          {localizedSolutions.map((item) => (
            <a
              key={item.slug}
              href={localePath(locale, `/solutions/${item.slug}`)}
              className="group flex min-h-96 flex-col rounded-3xl border border-slate-200 bg-white p-8 transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-2xl hover:shadow-blue-950/10"
            >
              <Image
                src={getSolutionCardImage(imageIds[item.slug], locale).src}
                alt={getSolutionCardImage(imageIds[item.slug], locale).alt}
                width={getSolutionCardImage(imageIds[item.slug], locale).width}
                height={getSolutionCardImage(imageIds[item.slug], locale).height}
                sizes="(max-width: 768px) 100vw, 33vw"
                className="mb-7 h-36 w-full rounded-2xl border border-slate-200 object-cover"
              />
              <span className="text-sm font-black tracking-[0.2em] text-blue-600">
                {item.number}
              </span>
              <h2 className="mt-8 text-3xl font-black tracking-tight">{item.title}</h2>
              <p className="mt-5 flex-1 leading-7 text-slate-600">{item.summary}</p>
              <div className="mt-7 flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <span className="mt-8 font-black text-blue-600">{copy.more}</span>
            </a>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
