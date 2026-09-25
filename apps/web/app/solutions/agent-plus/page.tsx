import Link from 'next/link';
import Image from 'next/image';
import { SiteHeader } from '../../../components/site-header';
import { getLocale, getOriginalPath } from '../../../lib/i18n-server';
import { localePath, stripLocale } from '../../../lib/i18n';
import { getSectionImage } from '../../../lib/section-images';

const pageCopy = {
  ru: {
    metadata: ['Agent+ — мобильная торговля | Avantime', 'Мобильная торговля, заказы, маршруты и обмен с 1С.'],
    hero: { badge: 'Agent+ · мобильная торговля', title: ['Продажи в поле —', 'под контролем в реальном времени'], description: 'Agent+ объединяет торгового представителя, клиента и 1С: маршруты, заказы, остатки, цены, задолженность, задачи и результаты визитов.', primary: 'Обсудить внедрение', secondary: 'Возможности Agent+' },
    day: { title: 'Рабочий день', role: 'Торговый представитель', timeline: [['09:00', 'Маршрут загружен', '8 торговых точек'], ['10:20', 'Заказ создан', '24 позиции · €1 840'], ['12:10', 'Фотоотчет принят', 'Выкладка подтверждена'], ['14:45', 'Оплата зафиксирована', 'Долг уменьшен на €620']] },
    capabilities: { eyebrow: 'Возможности', title: 'Все необходимое для мобильной команды продаж', items: [['Маршруты и визиты', 'Планирование маршрутов, контроль посещений и фиксация результата на мобильном устройстве.'], ['Заказы и остатки', 'Заказы с актуальными остатками, ценами, скидками и условиями поставки из учетной системы.'], ['Дебиторская задолженность', 'Контроль задолженности, лимитов и сроков оплаты до подтверждения заказа.'], ['Фото и задачи', 'Фотоотчеты, контроль выкладки, задания и подтверждение выполнения на торговой точке.'], ['Обмен с 1С', 'Двусторонний обмен справочниками, ценами, остатками, заказами, оплатами и результатами визитов.'], ['Работа без связи', 'Ключевые операции доступны офлайн, данные синхронизируются после восстановления связи.']] },
    integration: { eyebrow: 'Интеграция с 1С', title: 'Часть единого учетного контура', text: 'Agent+ получает из 1С справочники, цены, остатки и взаиморасчеты, а возвращает заказы, оплаты, результаты визитов, фото и задачи.', oneC: 'Номенклатура · цены · остатки · клиенты · задолженность', agent: 'Заказы · оплаты · визиты · фото · задачи · координаты' },
    rollout: { eyebrow: 'Внедрение', title: 'Запуск поэтапно, без остановки продаж', steps: [['01', 'Диагностика', 'Определяем роли, маршруты, документы, правила цен и состав обмена с 1С.'], ['02', 'Пилот', 'Запускаем рабочую версию на небольшой группе торговых представителей.'], ['03', 'Интеграция', 'Настраиваем обмен, права, контроль ошибок и мониторинг синхронизации.'], ['04', 'Масштабирование', 'Подключаем команду, обучаем пользователей и развиваем сценарии.']] },
    cta: { title: 'Покажем, как Agent+ впишется в ваши процессы', button: 'Запросить консультацию' },
  },
  lv: {
    metadata: ['Agent+ — mobilā tirdzniecība | Avantime', 'Mobilā tirdzniecība, pasūtījumi, maršruti un datu apmaiņa ar 1C.'],
    hero: { badge: 'Agent+ · mobilā tirdzniecība', title: ['Pārdošana laukā —', 'pārskatāma reāllaikā'], description: 'Agent+ savieno tirdzniecības pārstāvi, klientu un 1C: maršrutus, pasūtījumus, atlikumus, cenas, parādus, uzdevumus un vizīšu rezultātus.', primary: 'Pārrunāt ieviešanu', secondary: 'Agent+ iespējas' },
    day: { title: 'Darba diena', role: 'Tirdzniecības pārstāvis', timeline: [['09:00', 'Maršruts ielādēts', '8 tirdzniecības vietas'], ['10:20', 'Pasūtījums izveidots', '24 pozīcijas · €1 840'], ['12:10', 'Fotoatskaite pieņemta', 'Preču izvietojums apstiprināts'], ['14:45', 'Maksājums reģistrēts', 'Parāds samazināts par €620']] },
    capabilities: { eyebrow: 'Iespējas', title: 'Viss mobilai pārdošanas komandai', items: [['Maršruti un vizītes', 'Plānojiet maršrutus, kontrolējiet vizītes un fiksējiet rezultātu mobilajā ierīcē.'], ['Pasūtījumi un atlikumi', 'Pasūtījumi ar aktuāliem atlikumiem, cenām, atlaidēm un piegādes nosacījumiem no uzskaites sistēmas.'], ['Debitoru parādi', 'Kontrolējiet parādus, limitus un apmaksas termiņus pirms pasūtījuma apstiprināšanas.'], ['Fotoattēli un uzdevumi', 'Fotoatskaites, izvietojuma kontrole, uzdevumi un izpildes apstiprinājums tirdzniecības vietā.'], ['Apmaiņa ar 1C', 'Divvirzienu apmaiņa ar katalogiem, cenām, atlikumiem, pasūtījumiem, maksājumiem un vizīšu rezultātiem.'], ['Darbs bez savienojuma', 'Svarīgākās darbības ir pieejamas bezsaistē, dati sinhronizējas pēc savienojuma atjaunošanas.']] },
    integration: { eyebrow: 'Integrācija ar 1C', title: 'Vienotas uzskaites sistēmas daļa', text: 'Agent+ saņem no 1C katalogus, cenas, atlikumus un norēķinu datus, bet atgriež pasūtījumus, maksājumus, vizīšu rezultātus, fotoattēlus un uzdevumus.', oneC: 'Preces · cenas · atlikumi · klienti · parādi', agent: 'Pasūtījumi · maksājumi · vizītes · fotoattēli · uzdevumi · koordinātes' },
    rollout: { eyebrow: 'Ieviešana', title: 'Ieviešana pa posmiem, nepārtraucot pārdošanu', steps: [['01', 'Diagnostika', 'Nosakām lomas, maršrutus, dokumentus, cenu noteikumus un apmaiņas sastāvu ar 1C.'], ['02', 'Pilots', 'Palaižam darba versiju nelielai tirdzniecības pārstāvju grupai.'], ['03', 'Integrācija', 'Iestatām apmaiņu, tiesības, kļūdu kontroli un sinhronizācijas uzraudzību.'], ['04', 'Paplašināšana', 'Pieslēdzam komandu, apmācām lietotājus un attīstām scenārijus.']] },
    cta: { title: 'Parādīsim, kā Agent+ iekļausies jūsu procesos', button: 'Pieprasīt konsultāciju' },
  },
  en: {
    metadata: ['Agent+ — mobile sales | Avantime', 'Mobile sales, orders, routes and data exchange with 1C.'],
    hero: { badge: 'Agent+ · mobile sales', title: ['Field sales —', 'under control in real time'], description: 'Agent+ connects sales representatives, customers and 1C: routes, orders, stock, prices, balances, tasks and visit results.', primary: 'Discuss implementation', secondary: 'Agent+ capabilities' },
    day: { title: 'Working day', role: 'Sales representative', timeline: [['09:00', 'Route loaded', '8 customer locations'], ['10:20', 'Order created', '24 items · €1,840'], ['12:10', 'Photo report accepted', 'Display confirmed'], ['14:45', 'Payment recorded', 'Debt reduced by €620']] },
    capabilities: { eyebrow: 'Capabilities', title: 'Everything a mobile sales team needs', items: [['Routes and visits', 'Plan routes, monitor visits and record results on a mobile device.'], ['Orders and stock', 'Create orders with current stock, prices, discounts and delivery terms from the accounting system.'], ['Outstanding balances', 'Control balances, limits and payment terms before confirming an order.'], ['Photos and tasks', 'Photo reports, display checks, tasks and completion confirmation at the customer location.'], ['1C exchange', 'Two-way exchange of directories, prices, stock, orders, payments and visit results.'], ['Offline work', 'Key operations remain available offline and synchronise when the connection returns.']] },
    integration: { eyebrow: '1C integration', title: 'Part of one accounting environment', text: 'Agent+ receives directories, prices, stock and balances from 1C, then returns orders, payments, visit results, photos and tasks.', oneC: 'Products · prices · stock · customers · balances', agent: 'Orders · payments · visits · photos · tasks · coordinates' },
    rollout: { eyebrow: 'Implementation', title: 'Launch in stages without stopping sales', steps: [['01', 'Discovery', 'Define roles, routes, documents, pricing rules and the exchange scope with 1C.'], ['02', 'Pilot', 'Launch a working version with a small group of sales representatives.'], ['03', 'Integration', 'Configure exchange, permissions, error control and synchronisation monitoring.'], ['04', 'Scale', 'Connect the wider team, train users and develop the scenarios.']] },
    cta: { title: 'See how Agent+ can fit your processes', button: 'Request a consultation' },
  },
} as const;

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default async function AgentPlusPage() {
  const locale = await getLocale();
  const copy = pageCopy[locale];
  const currentPath = stripLocale(await getOriginalPath());
  const sectionImage = getSectionImage('agent-plus', locale);

  return (
    <main className="overflow-hidden bg-white text-slate-950">
      <SiteHeader locale={locale} currentPath={currentPath} />

      <section className="relative border-b border-slate-200 bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_30%,rgba(37,99,235,0.30),transparent_38%),radial-gradient(circle_at_25%_85%,rgba(34,211,238,0.16),transparent_32%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-14 px-6 py-20 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:py-28">
          <div>
            <div className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-200">
              {copy.hero.badge}
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              {copy.hero.title[0]}
              <span className="block bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                {copy.hero.title[1]}
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
              {copy.hero.description}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href={localePath(locale, '/#contact')}
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-blue-600 px-7 font-black text-white transition hover:bg-blue-500"
              >
                {copy.hero.primary} <ArrowIcon />
              </Link>
              <Link
                href="#capabilities"
                className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/20 bg-white/5 px-7 font-black text-white transition hover:bg-white/10"
              >
                {copy.hero.secondary}
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur sm:p-7">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">
                  {copy.day.title}
                </p>
                <p className="mt-2 text-2xl font-black">{copy.day.role}</p>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">
                online
              </span>
            </div>
            <div className="mt-6 space-y-3">
              {copy.day.timeline.map(([time, title, text]) => (
                <div
                  key={time}
                  className="grid grid-cols-[64px_1fr] gap-4 rounded-2xl bg-white/5 p-4"
                >
                  <span className="font-black text-blue-300">{time}</span>
                  <div>
                    <p className="font-black">{title}</p>
                    <p className="mt-1 text-sm text-slate-400">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-6">
          <Image
            src={sectionImage.src}
            alt={sectionImage.alt}
            width={1536}
            height={1024}
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="h-auto w-full rounded-3xl border border-slate-200 object-contain shadow-xl shadow-slate-950/10"
          />
        </div>
      </section>

      <section id="capabilities" className="bg-slate-50 py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <p className="eyebrow">{copy.capabilities.eyebrow}</p>
          <h2 className="section-title mt-4">{copy.capabilities.title}</h2>
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {copy.capabilities.items.map(([title, text], index) => (
              <article key={title} className="rounded-3xl border border-slate-200 bg-white p-7">
                <span className="text-sm font-black tracking-[0.18em] text-blue-600">
                  0{index + 1}
                </span>
                <h3 className="mt-7 text-2xl font-black tracking-tight">{title}</h3>
                <p className="mt-4 leading-7 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="eyebrow">{copy.integration.eyebrow}</p>
            <h2 className="section-title mt-4">{copy.integration.title}</h2>
            <p className="mt-6 text-lg leading-8 text-slate-600">{copy.integration.text}</p>
          </div>
          <div className="rounded-3xl bg-slate-950 p-8 text-white">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="rounded-2xl bg-white/5 p-6">
                <p className="font-black text-blue-300">1С</p>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  {copy.integration.oneC}
                </p>
              </div>
              <div className="text-center text-2xl">↔</div>
              <div className="rounded-2xl bg-white/5 p-6">
                <p className="font-black text-cyan-300">Agent+</p>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  {copy.integration.agent}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-950 py-24 text-white sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <p className="font-black uppercase tracking-[0.18em] text-cyan-300">{copy.rollout.eyebrow}</p>
          <h2 className="mt-4 text-4xl font-black tracking-[-0.035em] sm:text-5xl">
            {copy.rollout.title}
          </h2>
          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-white/10 md:grid-cols-2 lg:grid-cols-4">
            {copy.rollout.steps.map(([number, title, text]) => (
              <article key={number} className="bg-slate-950 p-7">
                <span className="text-sm font-black text-blue-300">{number}</span>
                <h3 className="mt-6 text-xl font-black">{title}</h3>
                <p className="mt-4 leading-7 text-slate-400">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-blue-600 py-16 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            {copy.cta.title}
          </h2>
          <Link
            href={localePath(locale, '/#contact')}
            className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-white px-7 font-black text-blue-700"
          >
            {copy.cta.button} <ArrowIcon />
          </Link>
        </div>
      </section>
    </main>
  );
}
