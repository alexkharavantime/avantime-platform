import Image from 'next/image';
import Link from 'next/link';
import { SiteHeader } from '../../components/site-header';
import { getLocale, getOriginalPath } from '../../lib/i18n-server';
import { localePath, stripLocale, type Locale } from '../../lib/i18n';

const copy: Record<Locale, {
  eyebrow: string;
  title: string;
  intro: string;
  contact: string;
  solutions: string;
  compare: string;
  variants: Array<{
    number: string;
    name: string;
    mood: string;
    title: string;
    text: string;
    image: string;
    imageAlt: string;
    href: string;
    cta: string;
  }>;
}> = {
  ru: {
    eyebrow: 'Design directions · Avantime',
    title: 'Три характера одного сайта',
    intro: 'Ниже — три визуальных направления для сайта Avantime. Все используют реальные сценарии компании: 1С, интеграции, поддержку и AI.',
    contact: 'Обсудить проект',
    solutions: 'Решения',
    compare: 'Сравнить направления',
    variants: [
      { number: '01', name: 'Clear System', mood: 'Спокойный, точный, доверительный', title: 'Автоматизация, которую легко объяснить', text: 'Светлая редакционная композиция для компаний, которым важно быстро понять пользу, этапы и следующий шаг.', image: '/images/avantime-homepage-hero.webp', imageAlt: 'Система, объединяющая бизнес-процессы', href: '/solutions/1c', cta: 'Посмотреть 1С' },
      { number: '02', name: 'Signal Room', mood: 'Технологичный, контрастный, уверенный', title: 'Все процессы — на одной панели управления', text: 'Тёмная среда с яркими сигналами для акцента на связности систем, данных и решений.', image: '/images/avantime-integrations.webp', imageAlt: 'Обмен данными между системами', href: '/solutions/integrations', cta: 'Открыть интеграции' },
      { number: '03', name: 'Field Work', mood: 'Живой, человеческий, практичный', title: 'Инструменты, которые двигают работу вперёд', text: 'Тёплая операционная подача с фокусом на людях, рабочих сценариях и ощутимом результате.', image: '/images/avantime-mobile-sales-hero.webp', imageAlt: 'Торговый представитель работает с мобильным устройством', href: '/solutions/agent-plus', cta: 'Посмотреть Agent+' },
    ],
  },
  lv: {
    eyebrow: 'Design directions · Avantime',
    title: 'Trīs raksturi vienai vietnei',
    intro: 'Trīs vizuālie virzieni Avantime vietnei, izmantojot reālus uzņēmuma scenārijus: 1C, integrācijas, atbalstu un AI.',
    contact: 'Pārrunāt projektu',
    solutions: 'Risinājumi',
    compare: 'Salīdzināt virzienus',
    variants: [
      { number: '01', name: 'Clear System', mood: 'Mierīgs, precīzs, uzticams', title: 'Automatizācija, ko viegli izskaidrot', text: 'Gaiša redakcionāla kompozīcija uzņēmumiem, kuriem svarīgi ātri saprast ieguvumu un nākamo soli.', image: '/images/avantime-homepage-hero.webp', imageAlt: 'Sistēma, kas apvieno biznesa procesus', href: '/solutions/1c', cta: 'Skatīt 1C' },
      { number: '02', name: 'Signal Room', mood: 'Tehnoloģisks, kontrastains, pārliecinošs', title: 'Visi procesi vienā vadības panelī', text: 'Tumša vide ar spilgtiem signāliem, kas izceļ sistēmu, datu un risinājumu savienojumu.', image: '/images/avantime-integrations.webp', imageAlt: 'Datu apmaiņa starp sistēmām', href: '/solutions/integrations', cta: 'Atvērt integrācijas' },
      { number: '03', name: 'Field Work', mood: 'Dzīvs, cilvēcīgs, praktisks', title: 'Rīki, kas virza darbu uz priekšu', text: 'Silts operacionāls stils ar fokusu uz cilvēkiem, darba scenārijiem un izmērāmu rezultātu.', image: '/images/avantime-mobile-sales-hero.webp', imageAlt: 'Tirdzniecības pārstāvis strādā ar mobilo ierīci', href: '/solutions/agent-plus', cta: 'Skatīt Agent+' },
    ],
  },
  en: {
    eyebrow: 'Design directions · Avantime',
    title: 'Three characters, one website',
    intro: 'Three visual directions for Avantime, grounded in real company scenarios: 1C, integrations, support and AI.',
    contact: 'Discuss a project',
    solutions: 'Solutions',
    compare: 'Compare directions',
    variants: [
      { number: '01', name: 'Clear System', mood: 'Calm, precise, trustworthy', title: 'Automation that is easy to explain', text: 'A bright editorial composition for companies that need to understand value, steps and the next move quickly.', image: '/images/avantime-homepage-hero.webp', imageAlt: 'A system connecting business processes', href: '/solutions/1c', cta: 'View 1C' },
      { number: '02', name: 'Signal Room', mood: 'Technical, high-contrast, confident', title: 'Every process on one control panel', text: 'A dark environment with bright signals that puts the connection between systems, data and decisions first.', image: '/images/avantime-integrations.webp', imageAlt: 'Data exchange between systems', href: '/solutions/integrations', cta: 'Open integrations' },
      { number: '03', name: 'Field Work', mood: 'Human, active, practical', title: 'Tools that move work forward', text: 'A warm operational direction focused on people, working scenarios and outcomes you can feel.', image: '/images/avantime-mobile-sales-hero.webp', imageAlt: 'A sales representative using a mobile device', href: '/solutions/agent-plus', cta: 'View Agent+' },
    ],
  },
};

function Arrow() {
  return <span aria-hidden="true" className="text-xl">↗</span>;
}

export default async function DesignsPage() {
  const locale = await getLocale();
  const currentPath = stripLocale(await getOriginalPath());
  const page = copy[locale];

  return (
    <main className="min-h-screen bg-[#f5f7f9] text-slate-950">
      <SiteHeader locale={locale} currentPath={currentPath} />

      <section className="border-b border-slate-200 bg-white px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <p className="eyebrow">{page.eyebrow}</p>
          <div className="mt-5 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <h1 className="max-w-5xl text-5xl font-black leading-[0.94] tracking-[-0.055em] sm:text-7xl lg:text-[6.7rem]">{page.title}</h1>
            <div className="max-w-md lg:justify-self-end">
              <p className="text-lg leading-8 text-slate-600">{page.intro}</p>
              <a href="#directions" className="mt-7 inline-flex items-center gap-3 rounded-full bg-slate-950 px-6 py-3 font-bold text-white transition hover:bg-blue-600">{page.compare} <Arrow /></a>
            </div>
          </div>
        </div>
      </section>

      <section id="directions" className="space-y-8 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-7xl space-y-8">
          <article className="overflow-hidden rounded-[2rem] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
              <div className="flex flex-col justify-between p-8 sm:p-12 lg:p-14">
                <div>
                  <div className="flex items-center justify-between"><span className="text-sm font-black text-blue-600">{page.variants[0].number}</span><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{page.variants[0].name}</span></div>
                  <p className="mt-20 text-xs font-black uppercase tracking-[0.18em] text-slate-400">{page.variants[0].mood}</p>
                  <h2 className="mt-4 max-w-xl text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">{page.variants[0].title}</h2>
                  <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">{page.variants[0].text}</p>
                </div>
                <Link href={localePath(locale, page.variants[0].href)} className="mt-10 inline-flex w-fit items-center gap-3 rounded-full bg-blue-600 px-6 py-3 font-bold text-white transition hover:bg-blue-500">{page.variants[0].cta} <Arrow /></Link>
              </div>
              <div className="relative min-h-[360px] bg-blue-50 lg:min-h-[560px]"><Image src={page.variants[0].image} alt={page.variants[0].imageAlt} fill sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover" /></div>
            </div>
          </article>

          <article className="overflow-hidden rounded-[2rem] bg-[#07101f] text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
            <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
              <div className="relative order-2 min-h-[360px] bg-cyan-950 lg:order-1 lg:min-h-[560px]"><Image src={page.variants[1].image} alt={page.variants[1].imageAlt} fill sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover opacity-80 mix-blend-screen" /></div>
              <div className="order-1 flex flex-col justify-between p-8 sm:p-12 lg:order-2 lg:p-14">
                <div><div className="flex items-center justify-between"><span className="text-sm font-black text-cyan-300">{page.variants[1].number}</span><span className="rounded-full border border-cyan-300/30 px-3 py-1 text-xs font-bold text-cyan-200">{page.variants[1].name}</span></div><p className="mt-20 text-xs font-black uppercase tracking-[0.18em] text-slate-400">{page.variants[1].mood}</p><h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">{page.variants[1].title}</h2><p className="mt-6 max-w-lg text-lg leading-8 text-slate-400">{page.variants[1].text}</p></div>
                <Link href={localePath(locale, page.variants[1].href)} className="mt-10 inline-flex w-fit items-center gap-3 rounded-full bg-cyan-300 px-6 py-3 font-black text-slate-950 transition hover:bg-white">{page.variants[1].cta} <Arrow /></Link>
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-[2rem] bg-[#f2e9dc] shadow-[0_24px_80px_rgba(120,72,30,0.12)]">
            <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
              <div className="flex flex-col justify-between p-8 sm:p-12 lg:p-14"><div><div className="flex items-center justify-between"><span className="text-sm font-black text-orange-700">{page.variants[2].number}</span><span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800">{page.variants[2].name}</span></div><p className="mt-20 text-xs font-black uppercase tracking-[0.18em] text-orange-700/60">{page.variants[2].mood}</p><h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">{page.variants[2].title}</h2><p className="mt-6 max-w-lg text-lg leading-8 text-orange-950/70">{page.variants[2].text}</p></div><Link href={localePath(locale, page.variants[2].href)} className="mt-10 inline-flex w-fit items-center gap-3 rounded-full bg-orange-600 px-6 py-3 font-black text-white transition hover:bg-orange-500">{page.variants[2].cta} <Arrow /></Link></div>
              <div className="relative min-h-[360px] bg-orange-100 lg:min-h-[560px]"><Image src={page.variants[2].image} alt={page.variants[2].imageAlt} fill sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover" /></div>
            </div>
          </article>
        </div>
      </section>

      <section className="bg-blue-600 px-6 py-16 text-white sm:py-20"><div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black uppercase tracking-[0.18em] text-blue-100">Avantime</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{page.contact}</h2></div><Link href={localePath(locale, '/#contact')} className="inline-flex w-fit items-center gap-3 rounded-full bg-white px-6 py-3 font-black text-blue-700 transition hover:bg-blue-50">{page.contact} <Arrow /></Link></div></section>
    </main>
  );
}
