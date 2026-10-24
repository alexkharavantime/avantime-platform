import Link from 'next/link';
import Image from 'next/image';
import { ContactForm } from '../components/contact-form';
import { SiteHeader } from '../components/site-header';
import { getLocale, getOriginalPath } from '../lib/i18n-server';
import { homeCopy, localePath, stripLocale } from '../lib/i18n';
import { getSectionImage } from '../lib/section-images';
import { getSolutionCardImage, type SolutionCardImageId } from '@/lib/solution-card-images';

const secondarySolutionLayout = [
  {
    href: '/solutions/ut-1-3',
    cardId: 'implementation' as SolutionCardImageId,
    accent: 'from-amber-400 to-orange-500',
    icon: '1С',
  },
  {
    href: '/solutions/integrations',
    cardId: 'integrations' as SolutionCardImageId,
    accent: 'from-emerald-500 to-cyan-500',
    icon: '↔',
  },
  {
    href: '/solutions/portals',
    cardId: 'portals' as SolutionCardImageId,
    accent: 'from-blue-500 to-cyan-500',
    icon: '✓',
  },
  {
    href: '/solutions/ai',
    cardId: 'ai' as SolutionCardImageId,
    accent: 'from-violet-500 to-blue-500',
    icon: '✦',
  },
];

function Arrow({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export default async function HomePage() {
  const locale = await getLocale();
  const copy = homeCopy[locale];
  const currentPath = stripLocale(await getOriginalPath());
  const homeImage = getSectionImage('homepage-hero', locale);
  const approachImage = getSectionImage('approach', locale);

  return (
    <main id="top" className="overflow-hidden bg-white text-slate-950">
      <SiteHeader locale={locale} currentPath={currentPath} />

      <section className="relative isolate overflow-hidden bg-slate-50 text-slate-950">
        <div className="landing-grid absolute inset-0 opacity-20" />
        <div className="absolute -right-48 top-0 h-[520px] w-[520px] rounded-full bg-blue-200/40 blur-[120px]" />
        <div className="relative mx-auto grid max-w-7xl gap-16 px-6 py-20 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-28">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-blue-100 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_14px_#34d399]" />
              {copy.hero.badge}
            </div>
            <h1 className="mt-8 max-w-3xl text-5xl font-black leading-[0.96] tracking-[-0.05em] sm:text-6xl lg:text-[5.2rem]">
              {copy.hero.title[0]}
              <span className="block bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 bg-clip-text text-transparent">
                {copy.hero.title[1]}
              </span>
              {copy.hero.title[2]}
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">{copy.hero.description}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="#contact"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-blue-500 px-7 font-black text-white shadow-xl shadow-blue-600/30 transition hover:-translate-y-0.5 hover:bg-blue-400"
              >
                {copy.hero.primaryCta} <Arrow />
              </a>
              <Link
                href={localePath(locale, '/solutions')}
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full border border-slate-300 bg-white px-7 font-bold text-slate-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
              >
                {copy.hero.solutionsCta}
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-slate-600">
              {copy.hero.proofs.map((item) => (
                  <span key={item} className="flex items-center gap-2">
                    <span className="text-emerald-600">
                      <Check />
                    </span>
                    {item}
                  </span>
                ))}
            </div>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-3 shadow-2xl shadow-blue-950/10 sm:p-5">
            <Image
              src={homeImage.src}
              alt={homeImage.alt}
              width={1774}
              height={887}
              priority
              sizes="(max-width: 1024px) 100vw, 52vw"
              className="h-auto w-full rounded-[1.5rem] object-cover"
            />
          </div>
        </div>
      </section>

      <section id="solutions" className="bg-slate-50 py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="eyebrow">{copy.capabilitiesIntro.eyebrow}</p>
              <h2 className="section-title mt-4">{copy.capabilitiesIntro.title}</h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-slate-600 lg:justify-self-end">
              {copy.capabilitiesIntro.text}
            </p>
          </div>

          <div className="mt-14 grid overflow-hidden rounded-[2rem] border border-slate-200 bg-white lg:grid-cols-4">
            {copy.capabilities.map(({ number, title, text }, index) => (
              <article
                key={number}
                className={`relative p-7 lg:min-h-[300px] ${index < copy.capabilities.length - 1 ? 'border-b border-slate-200 lg:border-b-0 lg:border-r' : ''}`}
              >
                <span className="text-xs font-black tracking-[0.18em] text-blue-600">{number}</span>
                <h3 className="mt-10 text-2xl font-black tracking-tight">{title}</h3>
                <p className="mt-4 leading-7 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <Link
              href={localePath(locale, '/solutions/1c/configurations')}
              className="inline-flex items-center gap-2 font-black text-blue-600 transition hover:gap-3"
            >
              {copy.capabilitiesIntro.link} <Arrow />
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[#07101f] py-24 text-white sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
              {copy.secondaryIntro.eyebrow}
            </p>
            <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-6xl">
              {copy.secondaryIntro.title}
            </h2>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {secondarySolutionLayout.map((item, index) => {
              const card = copy.secondaryCards[index];
              return (
              <Link
                href={localePath(locale, item.href)}
                key={card.label}
                className="group relative min-h-[330px] overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-7 transition hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07] sm:p-9"
              >
                <div
                  className={`absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gradient-to-br ${item.accent} opacity-15 blur-3xl transition group-hover:opacity-25`}
                />
                <div className="relative flex h-full flex-col">
                  <div className="relative mb-6 aspect-[3/2] w-full overflow-hidden rounded-2xl bg-white/95">
                    <Image
                      src={getSolutionCardImage(item.cardId, locale).src}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-contain opacity-90"
                    />
                  </div>
                  <div className="flex items-start justify-between">
                    <span
                      className={`grid h-13 w-13 place-items-center rounded-2xl bg-gradient-to-br ${item.accent} text-xl font-black shadow-lg`}
                    >
                      {item.icon}
                    </span>
                    <span className="grid h-11 w-11 place-items-center rounded-full border border-white/10 text-slate-400 transition group-hover:border-white/20 group-hover:text-white">
                      <Arrow />
                    </span>
                  </div>
                  <p className="mt-10 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                    {card.label}
                  </p>
                  <h3 className="mt-3 text-3xl font-black tracking-tight">{card.title}</h3>
                  <p className="mt-4 max-w-xl text-base leading-7 text-slate-400">{card.text}</p>
                </div>
              </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section id="approach" className="py-24 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-2 lg:items-center lg:gap-14">
          <div>
            <p className="eyebrow">{copy.approach.eyebrow}</p>
            <h2 className="section-title mt-4">{copy.approach.title}</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">{copy.approach.text}</p>
            <div className="relative mt-8 aspect-[3/2] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <Image
                src={approachImage.src}
                alt={approachImage.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain"
              />
            </div>
          </div>
          <div className="space-y-3">
            {copy.approach.outcomes.map(({ title, text }, index) => (
              <article
                key={title}
                className="group grid gap-5 rounded-2xl border border-slate-200 p-6 transition hover:border-blue-200 hover:bg-blue-50/40 sm:grid-cols-[64px_1fr] sm:items-start"
              >
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-lg font-black text-white transition group-hover:bg-blue-600">
                  0{index + 1}
                </span>
                <div>
                  <h3 className="text-xl font-black">{title}</h3>
                  <p className="mt-2 leading-7 text-slate-600">{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="relative overflow-hidden bg-slate-100 py-24 sm:py-28">
        <div className="absolute left-0 top-0 h-96 w-96 rounded-full bg-blue-300/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="eyebrow">{copy.contact.eyebrow}</p>
            <h2 className="section-title mt-4">{copy.contact.title}</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">{copy.contact.text}</p>
            <div className="mt-9 space-y-4">
              {copy.contact.proofs.map((item) => (
                <div key={item} className="flex items-center gap-3 font-bold text-slate-800">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-blue-600 shadow-sm">
                    <Check />
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <ContactForm locale={locale} />
        </div>
      </section>

      <footer className="bg-[#07101f] text-slate-400">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.3fr_0.7fr_0.7fr]">
          <div className="max-w-md">
            <p className="text-2xl font-black text-white">
              Avantime<span className="text-blue-500">.</span>
            </p>
            <p className="mt-4 leading-7">
              {copy.footer.description}
            </p>
          </div>
          <div>
            <p className="font-black text-white">{copy.footer.solutions}</p>
            <div className="mt-4 space-y-3 text-sm">
              <Link className="block hover:text-white" href={localePath(locale, '/solutions/1c')}>
                {copy.footer.implementation}
              </Link>
              <Link className="block hover:text-white" href={localePath(locale, '/solutions/ai')}>
                {copy.footer.ai}
              </Link>
              <Link className="block hover:text-white" href={localePath(locale, '/solutions/agent-plus')}>
                Agent+
              </Link>
              <Link className="block hover:text-white" href={localePath(locale, '/solutions/integrations')}>
                {copy.footer.integrations}
              </Link>
            </div>
          </div>
          <div>
            <p className="font-black text-white">{copy.footer.company}</p>
            <div className="mt-4 space-y-3 text-sm">
              <Link className="block hover:text-white" href={localePath(locale, '/knowledge')}>
                {copy.footer.knowledge}
              </Link>
              <Link className="block hover:text-white" href={localePath(locale, '/assistant')}>
                {copy.footer.assistant}
              </Link>
              <Link className="block hover:text-white" href="/portal">
                {copy.footer.portal}
              </Link>
              <a className="block hover:text-white" href="mailto:info@avantime.lv">
                info@avantime.lv
              </a>
              <span className="block">{copy.footer.location}</span>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-6 text-xs sm:flex-row sm:justify-between">
            <span>© 2026 Avantime</span>
            <span>{copy.footer.stack}</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
