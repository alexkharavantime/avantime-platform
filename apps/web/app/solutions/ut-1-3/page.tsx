import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ContactForm } from '../../../components/contact-form';
import { PageShell } from '../../../components/page-shell';
import { getLocale } from '../../../lib/i18n-server';

const metadataCopy = {
  lv: {
    title: 'Tirdzniecības vadība — Avantime',
    description: '1C Tirdzniecības vadības ieviešana pārdošanai, iepirkumiem, noliktavai un norēķiniem.',
  },
  ru: {
    title: 'Управление торговлей — Avantime',
    description: 'Внедрение и развитие 1С: Управление торговлей для продаж, закупок, склада и расчётов.',
  },
  en: {
    title: 'Trade Management — Avantime',
    description: 'Trade Management implementation for sales, purchasing, inventory and balances.',
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  return metadataCopy[await getLocale()];
}

const capabilities = [
  {
    title: 'Отвечайте клиенту сразу',
    question: 'Есть ли нужный товар? Сколько стоит? Что уже зарезервировано?',
    text: 'Остатки, цены и заказы доступны в программе. Менеджер может подобрать товар, оформить заказ и зарезервировать его прямо во время разговора.',
  },
  {
    title: 'Покупайте то, что нужно продавать',
    question: 'Одного товара постоянно не хватает, другой месяцами занимает полки?',
    text: 'Закупки можно планировать с учётом заказов покупателей, текущих запасов и ожидаемых поступлений. Закупщик видит, что уже заказано и где требуется пополнение.',
  },
  {
    title: 'Знайте, что происходит на складе',
    question: 'Товар поступил, переместился, был отгружен или возвращён?',
    text: 'Каждое движение отражается в системе. Можно проверить остатки, проследить движение товара и провести инвентаризацию по нескольким складам.',
  },
  {
    title: 'Предлагайте нужную цену без путаницы',
    question: 'Оптовые и розничные цены, скидки и специальные условия?',
    text: 'Разные типы цен и скидки настраиваются под условия продажи. Сотруднику проще оформить заказ правильно, а компании — соблюдать ценовую политику.',
  },
  {
    title: 'Держите заказы и оплаты в поле зрения',
    question: 'Что уже отгружено, а какие заказы ещё ждут выполнения?',
    text: 'Информация о торговых операциях и взаиморасчётах помогает вовремя вернуться к незавершённому заказу, уточнить оплату и спланировать дальнейшую работу.',
  },
  {
    title: 'Смотрите на бизнес через цифры',
    question: 'Какие товары пользуются спросом и что задерживается на складе?',
    text: 'Отчёты помогают анализировать продажи, ассортимент и запасы за выбранный период, чтобы принимать решения о закупках и работе с покупателями.',
  },
];

const implementationSteps = [
  ['01', 'Изучаем процессы', 'Разбираемся, как вы продаёте, закупаете, храните товар и работаете с клиентами.'],
  ['02', 'Согласовываем настройки', 'Показываем возможности «Управления торговлей» 1.3 и определяем необходимые доработки.'],
  ['03', 'Переносим и проверяем', 'Помогаем перенести данные, настроить обмен и проверить рабочие сценарии.'],
  ['04', 'Обучаем и поддерживаем', 'Помогаем сотрудникам освоить изменения и остаёмся на связи после запуска.'],
];

const utPageCopy = {
  ru: {
    back: '← Все решения', label: '1С · Управление торговлей 1.3', hero: 'От первого заказа до отгрузки — всё под контролем', intro: '«Управление торговлей» помогает связать продажи, закупки, склад и расчёты в одной программе. Avantime настраивает систему под вашу компанию и реальные процессы.', demo: 'Посмотреть программу в работе', eyebrow: 'Возможности программы', capabilitiesTitle: 'Единые данные для менеджеров, закупщиков, склада и бухгалтерии', integrationEyebrow: 'Интеграции', integrationTitle: 'Торговля и бухгалтерия — без повторного ввода', integrationText: 'Avantime настраивает обмен между «Управлением торговлей» и бухгалтерской программой. Согласованные данные передаются по правилам обмена, а каждый отдел продолжает работать в своей системе.', integrationExtra: 'Дополнительные подключения к интернет-магазину, электронному документообороту и другим сервисам подбираем под ваши задачи.', implementation: 'Внедрение', implementationTitle: 'Программа должна подходить вашей работе', implementationText: 'Кто-то продаёт со склада, кто-то закупает под заказ. Одним нужны индивидуальные цены, другим — несколько складов и большой ассортимент. Мы начинаем с ваших процессов.', next: 'Следующий шаг', nextTitle: 'Посмотрите, как это будет работать у вас', nextText: 'Расскажите, что сейчас отнимает больше всего времени: обработка заказов, закупки, склад или обмен с бухгалтерией. Мы покажем, как решить эту задачу в «Управлении торговлей» 1.3.', contact: 'Avantime · info@avantime.lv', capabilities, steps: implementationSteps,
  },
  en: {
    back: '← All solutions', label: '1C · Trade Management 1.3', hero: 'From the first order to shipment — everything under control', intro: 'Trade Management connects sales, purchasing, inventory and balances in one system. Avantime adapts it to your company and real processes.', demo: 'See the programme in action', eyebrow: 'Programme capabilities', capabilitiesTitle: 'One set of data for sales, purchasing, warehouse and accounting teams', integrationEyebrow: 'Integrations', integrationTitle: 'Trade and accounting without duplicate entry', integrationText: 'Avantime configures data exchange between Trade Management and accounting software. Each team keeps working in its own system while agreed data moves by clear rules.', integrationExtra: 'Connections to online stores, electronic document exchange and other services are selected for your tasks.', implementation: 'Implementation', implementationTitle: 'The programme should fit the way you work', implementationText: 'Some companies sell from stock, others purchase to order. Some need individual prices, others need several warehouses and a large assortment. We start with your processes.', next: 'Next step', nextTitle: 'See how it can work for your business', nextText: 'Tell us what takes the most time today: order processing, purchasing, warehouse work or accounting exchange. We will show how Trade Management 1.3 can address it.', contact: 'Avantime · info@avantime.lv', capabilities: [
      { title: 'Answer customers immediately', question: 'Is the product available? What does it cost? What is reserved?', text: 'Stock, prices and orders are available in the system. A manager can select a product, create an order and reserve it during the call.' },
      { title: 'Purchase what you need to sell', question: 'One product is always missing while another sits on the shelf?', text: 'Plan purchasing using customer orders, current stock and expected deliveries.' },
      { title: 'Know what happens in the warehouse', question: 'Was the product received, moved, shipped or returned?', text: 'Every movement is recorded. Check stock, follow product movement and perform inventory across several warehouses.' },
      { title: 'Offer the right price without confusion', question: 'Wholesale and retail prices, discounts and special terms?', text: 'Use different price types and discounts for each sales condition while following the agreed pricing policy.' },
      { title: 'Keep orders and payments in view', question: 'What has shipped and which orders are still pending?', text: 'Trade operations and balances help you return to unfinished orders, clarify payments and plan next steps.' },
      { title: 'See the business through numbers', question: 'Which products are in demand and what is stuck in stock?', text: 'Reports help analyse sales, assortment and inventory for a selected period.' },
    ], steps: [['01', 'Study processes', 'We review how you sell, purchase, store products and work with customers.'], ['02', 'Agree settings', 'We show the capabilities of Trade Management 1.3 and define required customisation.'], ['03', 'Migrate and verify', 'We help transfer data, configure exchange and test real workflows.'], ['04', 'Train and support', 'We help employees adopt the changes and stay available after launch.']],
  },
  lv: {
    back: '← Visi risinājumi', label: '1C · Tirdzniecības vadība 1.3', hero: 'No pirmā pasūtījuma līdz nosūtīšanai — viss kontrolē', intro: 'Tirdzniecības vadība savieno pārdošanu, iepirkumus, noliktavu un norēķinus vienā programmā. Avantime pielāgo sistēmu jūsu uzņēmumam un faktiskajiem procesiem.', demo: 'Apskatīt programmu darbībā', eyebrow: 'Programmas iespējas', capabilitiesTitle: 'Vienoti dati pārdošanas, iepirkumu, noliktavas un grāmatvedības komandām', integrationEyebrow: 'Integrācijas', integrationTitle: 'Tirdzniecība un grāmatvedība bez atkārtotas ievades', integrationText: 'Avantime konfigurē datu apmaiņu starp Tirdzniecības vadību un grāmatvedības programmu. Katra nodaļa turpina strādāt savā sistēmā, bet saskaņotie dati tiek nodoti pēc skaidriem noteikumiem.', integrationExtra: 'Savienojumus ar interneta veikaliem, elektronisko dokumentu apriti un citiem servisiem izvēlamies jūsu uzdevumiem.', implementation: 'Ieviešana', implementationTitle: 'Programmai jāatbilst jūsu darba veidam', implementationText: 'Daži uzņēmumi pārdod no noliktavas, citi iepērk pēc pasūtījuma. Vieniem vajadzīgas individuālas cenas, citiem — vairākas noliktavas un plašs sortiments. Mēs sākam ar jūsu procesiem.', next: 'Nākamais solis', nextTitle: 'Apskatīsim, kā tas darbosies jūsu uzņēmumā', nextText: 'Pastāstiet, kas šobrīd aizņem visvairāk laika: pasūtījumu apstrāde, iepirkumi, noliktava vai apmaiņa ar grāmatvedību. Parādīsim, kā šo uzdevumu risināt Tirdzniecības vadībā 1.3.', contact: 'Avantime · info@avantime.lv', capabilities: [
      { title: 'Atbildiet klientam uzreiz', question: 'Vai prece ir noliktavā? Cik tā maksā? Kas jau rezervēts?', text: 'Atlikumi, cenas un pasūtījumi ir pieejami programmā. Pārdevējs var izvēlēties preci, noformēt pasūtījumu un rezervēt to sarunas laikā.' },
      { title: 'Iepērciet to, ko vajag pārdot', question: 'Vienas preces trūkst, bet cita mēnešiem aizņem plauktus?', text: 'Plānojiet iepirkumus pēc klientu pasūtījumiem, aktuālajiem atlikumiem un gaidāmajām piegādēm.' },
      { title: 'Ziniet, kas notiek noliktavā', question: 'Prece saņemta, pārvietota, nosūtīta vai atgriezta?', text: 'Katra kustība tiek reģistrēta. Pārbaudiet atlikumus un veiciet inventarizāciju vairākās noliktavās.' },
      { title: 'Piedāvājiet pareizo cenu', question: 'Vairumtirdzniecības un mazumtirdzniecības cenas, atlaides un īpaši nosacījumi?', text: 'Izmantojiet dažādus cenu veidus un atlaides, ievērojot saskaņoto cenu politiku.' },
      { title: 'Pārskatiet pasūtījumus un maksājumus', question: 'Kas jau nosūtīts un kuri pasūtījumi vēl jāizpilda?', text: 'Tirdzniecības operāciju un norēķinu informācija palīdz plānot nākamos soļus.' },
      { title: 'Skatieties uz biznesu caur skaitļiem', question: 'Kuras preces pieprasa visvairāk un kas kavējas noliktavā?', text: 'Pārskati palīdz analizēt pārdošanu, sortimentu un krājumus izvēlētajā periodā.' },
    ], steps: [['01', 'Izpētām procesus', 'Analizējam, kā pārdodat, iepērkat, glabājat preces un strādājat ar klientiem.'], ['02', 'Saskaņojam iestatījumus', 'Parādām Tirdzniecības vadības 1.3 iespējas un nosakām nepieciešamos pielāgojumus.'], ['03', 'Pārceļam un pārbaudām', 'Palīdzam pārnest datus, konfigurēt apmaiņu un pārbaudīt darba scenārijus.'], ['04', 'Apmācām un atbalstām', 'Palīdzam darbiniekiem apgūt izmaiņas un paliekam pieejami pēc palaišanas.']],
  },
} as const;

const localizedOverview = {
  lv: {
    src: '/images/avantime-trade-management-hero.webp',
    alt: 'Darbinieki pārbauda pasūtījumus un preču pieejamību birojā pie noliktavas.',
  },
  ru: {
    src: '/images/avantime-trade-management-hero.webp',
    alt: 'Сотрудники проверяют заказы и наличие товаров в офисе при складе.',
  },
  en: {
    src: '/images/avantime-trade-management-hero.webp',
    alt: 'Employees review orders and stock availability in an office overlooking a warehouse.',
  },
} as const;

export default async function TradeManagementPage() {
  const locale = await getLocale();
  const overview = localizedOverview[locale];
  const copy = JSON.parse(JSON.stringify(utPageCopy[locale]).replaceAll(' 1.3', '')) as (typeof utPageCopy)[typeof locale];
  const sectionLinks = locale === 'lv'
    ? [['#capabilities', 'Iespējas'], ['#integrations', 'Integrācijas'], ['#implementation', 'Ieviešana'], ['#contact', 'Kontakti']]
    : locale === 'en'
      ? [['#capabilities', 'Capabilities'], ['#integrations', 'Integrations'], ['#implementation', 'Implementation'], ['#contact', 'Contact']]
      : [['#capabilities', 'Возможности'], ['#integrations', 'Интеграции'], ['#implementation', 'Внедрение'], ['#contact', 'Контакты']];

  return (
    <PageShell>
      <main className="overflow-hidden bg-white text-slate-950">
        <section className="bg-slate-950 text-white">
          <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
            <p className="mt-10 text-sm font-black uppercase tracking-[0.2em] text-blue-300">
              {copy.label}
            </p>
            <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[0.98] tracking-[-0.045em] sm:text-7xl">
              {copy.hero}
            </h1>
            <p className="mt-7 max-w-3xl text-xl leading-9 text-slate-300">
              {copy.intro}
            </p>
            <Link
              href="#contact"
              className="mt-9 inline-flex min-h-14 items-center justify-center rounded-full bg-blue-500 px-7 font-black text-white transition hover:bg-blue-400"
            >
              {copy.demo}
            </Link>
          </div>
        </section>

        <nav aria-label={locale === 'en' ? 'On this page' : locale === 'lv' ? 'Šajā lapā' : 'На странице'} className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-6 py-3">
            {sectionLinks.map(([href, label]) => (
              <a key={href} href={href} className="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">
                {label}
              </a>
            ))}
          </div>
        </nav>

        <section className="border-b border-slate-200 bg-white py-10 sm:py-14">
          <div className="mx-auto max-w-7xl px-6">
            <a
              href="/images/avantime-ut-1-3-overview.webp"
              target="_blank"
              rel="noreferrer"
              aria-label="Открыть иллюстрацию «Управление торговлей 1.3» в полном размере"
            >
              <Image
                src={overview.src}
                alt={overview.alt}
                width={1774}
                height={887}
                priority
                sizes="(max-width: 1280px) 100vw, 1280px"
                className="h-auto w-full rounded-3xl border border-slate-200 object-contain shadow-xl shadow-slate-950/10"
              />
            </a>
          </div>
        </section>

        <section id="capabilities" className="bg-slate-50 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2 className="section-title mt-4 max-w-4xl">{copy.capabilitiesTitle}</h2>
            <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {copy.capabilities.map((item, index) => (
                <article key={item.title} className="rounded-3xl border border-slate-200 bg-white p-7">
                  <span className="text-sm font-black tracking-[0.18em] text-blue-600">
                    0{index + 1}
                  </span>
                  <h3 className="mt-6 text-2xl font-black tracking-tight">{item.title}</h3>
                  <p className="mt-4 font-bold leading-7 text-slate-800">{item.question}</p>
                  <p className="mt-4 leading-7 text-slate-600">{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="integrations" className="py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="eyebrow">{copy.integrationEyebrow}</p>
              <h2 className="section-title mt-4">{copy.integrationTitle}</h2>
              <p className="mt-6 text-lg leading-8 text-slate-600">{copy.integrationText}</p>
              <p className="mt-5 text-lg leading-8 text-slate-600">{copy.integrationExtra}</p>
            </div>
            <div className="rounded-3xl bg-slate-950 p-8 text-white">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">
                Единый контур
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-3 sm:items-center">
                {['Продажи', 'Управление торговлей 1.3', 'Бухгалтерия и сервисы'].map((item, index) => (
                  <div key={item} className="rounded-2xl bg-white/10 p-5 text-center font-black">
                    {item}
                    {index < 2 && <span className="mt-3 block text-cyan-300">↔</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="implementation" className="bg-slate-950 py-20 text-white sm:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">{copy.implementation}</p>
            <h2 className="mt-4 max-w-4xl text-4xl font-black tracking-[-0.035em] sm:text-5xl">
              {copy.implementationTitle}
            </h2>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
              {copy.implementationText}
            </p>
            <div className="mt-12 grid gap-px overflow-hidden rounded-3xl bg-white/10 md:grid-cols-2 lg:grid-cols-4">
              {copy.steps.map(([number, title, text]) => (
                <article key={number} className="bg-slate-950 p-7">
                  <span className="text-sm font-black text-blue-300">{number}</span>
                  <h3 className="mt-6 text-xl font-black">{title}</h3>
                  <p className="mt-4 leading-7 text-slate-400">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="bg-blue-50 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div>
              <p className="eyebrow">{copy.next}</p>
              <h2 className="section-title mt-4">{copy.nextTitle}</h2>
              <p className="mt-6 text-lg leading-8 text-slate-600">{copy.nextText}</p>
              <p className="mt-8 text-lg font-black text-slate-900">{copy.contact}</p>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>
    </PageShell>
  );
}
