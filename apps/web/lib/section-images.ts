import type { Locale } from './i18n';

export type SectionImageId = 'home' | 'homepage-hero' | 'onec' | 'trade-management' | 'accounting' | 'manufacturing' | 'addressed-warehouse' | 'platform' | 'agent-plus' | 'ai' | 'integrations' | 'cloud' | 'portals' | 'knowledge';

type SectionImage = { src: string; alt: string };

const images: Record<SectionImageId, Record<Locale, SectionImage>> = {
  'homepage-hero': {
    ru: { src: '/images/avantime-homepage-hero.webp', alt: 'Компьютерная система, объединяющая учёт, склад и производство.' },
    en: { src: '/images/avantime-homepage-hero.webp', alt: 'A computer system connecting accounting, warehousing and manufacturing.' },
    lv: { src: '/images/avantime-homepage-hero.webp', alt: 'Datorsistēma, kas apvieno uzskaiti, noliktavu un ražošanu.' },
  },
  home: {
    ru: { src: '/images/avantime-home.webp', alt: 'Офис, склад и магазин, объединённые общими бизнес-процессами.' },
    en: { src: '/images/avantime-home.webp', alt: 'An office, warehouse and shop connected through shared business processes.' },
    lv: { src: '/images/avantime-home.webp', alt: 'Birojs, noliktava un veikals, kurus vieno kopīgi biznesa procesi.' },
  },
  onec: {
    ru: { src: '/images/avantime-onec.webp', alt: 'Документы, учётная книга, калькулятор и товары в общей системе учёта.' },
    en: { src: '/images/avantime-onec.webp', alt: 'Documents, a ledger, a calculator and goods within a shared accounting system.' },
    lv: { src: '/images/avantime-onec.webp', alt: 'Dokumenti, uzskaites žurnāls, kalkulators un preces vienotā uzskaites sistēmā.' },
  },
  'trade-management': {
    ru: { src: '/images/avantime-trade-management-hero.webp', alt: 'Сотрудники проверяют заказы и наличие товаров в офисе при складе.' },
    en: { src: '/images/avantime-trade-management-hero.webp', alt: 'Employees review orders and stock availability in an office overlooking a warehouse.' },
    lv: { src: '/images/avantime-trade-management-hero.webp', alt: 'Darbinieki pārbauda pasūtījumus un preču pieejamību birojā pie noliktavas.' },
  },
  accounting: {
    ru: { src: '/images/avantime-accounting-hero.webp', alt: 'Бухгалтер сверяет документы с учётными данными на экранах.' },
    en: { src: '/images/avantime-accounting-hero.webp', alt: 'An accountant checks documents against accounting records on the screens.' },
    lv: { src: '/images/avantime-accounting-hero.webp', alt: 'Grāmatvede salīdzina dokumentus ar uzskaites datiem ekrānos.' },
  },
  manufacturing: {
    ru: { src: '/images/avantime-manufacturing-hero.webp', alt: 'Планирование производства, материалы и выпуск продукции.' },
    en: { src: '/images/avantime-manufacturing-hero.webp', alt: 'Production planning, materials and finished goods.' },
    lv: { src: '/images/avantime-manufacturing-hero.webp', alt: 'Ražošanas plānošana, materiāli un gatavā produkcija.' },
  },
  'addressed-warehouse': {
    ru: { src: '/images/avantime-addressed-warehouse-hero.webp', alt: 'Складские ячейки, сканер и подбор товаров.' },
    en: { src: '/images/avantime-addressed-warehouse-hero.webp', alt: 'Warehouse bins, a scanner and order picking.' },
    lv: { src: '/images/avantime-addressed-warehouse-hero.webp', alt: 'Noliktavas šūnas, skeneris un preču komplektēšana.' },
  },
  platform: {
    ru: { src: '/images/avantime-platform-hero.webp', alt: 'Компьютер и модули бизнес-приложений на общей технологической основе.' },
    en: { src: '/images/avantime-platform-hero.webp', alt: 'A computer and business application modules on a shared technology foundation.' },
    lv: { src: '/images/avantime-platform-hero.webp', alt: 'Dators un biznesa lietotņu moduļi uz kopīga tehnoloģiskā pamata.' },
  },
  'agent-plus': {
    ru: { src: '/images/avantime-mobile-sales-hero.webp', alt: 'Торговый представитель оформляет заказ на мобильном устройстве у клиента.' },
    en: { src: '/images/avantime-mobile-sales-hero.webp', alt: 'A sales representative uses a mobile device to take an order during a customer visit.' },
    lv: { src: '/images/avantime-mobile-sales-hero.webp', alt: 'Tirdzniecības pārstāvis noformē pasūtījumu mobilajā ierīcē klienta apmeklējuma laikā.' },
  },
  ai: {
    ru: { src: '/images/avantime-ai.webp', alt: 'Специалисты работают с AI-помощником и материалами на экране.' },
    en: { src: '/images/avantime-ai.webp', alt: 'Specialists work with an AI assistant and source materials on screen.' },
    lv: { src: '/images/avantime-ai.webp', alt: 'Speciālisti strādā ar AI palīgu un avotu materiāliem ekrānā.' },
  },
  integrations: {
    ru: { src: '/images/avantime-integrations.webp', alt: 'Специалисты проверяют обмен данными между бизнес-системами.' },
    en: { src: '/images/avantime-integrations.webp', alt: 'Specialists check data exchange between business systems.' },
    lv: { src: '/images/avantime-integrations.webp', alt: 'Speciālisti pārbauda datu apmaiņu starp biznesa sistēmām.' },
  },
  cloud: {
    ru: { src: '/images/avantime-cloud.webp', alt: 'Инженер контролирует серверную инфраструктуру в центре обработки данных.' },
    en: { src: '/images/avantime-cloud.webp', alt: 'An engineer monitors server infrastructure in a data centre.' },
    lv: { src: '/images/avantime-cloud.webp', alt: 'Inženieris uzrauga serveru infrastruktūru datu centrā.' },
  },
  portals: {
    ru: { src: '/images/avantime-portals.webp', alt: 'Клиент и менеджер просматривают каталог и заказы на ноутбуке и планшете.' },
    en: { src: '/images/avantime-portals.webp', alt: 'A customer and account manager review a catalogue and orders on a laptop and tablet.' },
    lv: { src: '/images/avantime-portals.webp', alt: 'Klients un menedžeris apskata katalogu un pasūtījumus klēpjdatorā un planšetdatorā.' },
  },
  knowledge: {
    ru: { src: '/images/avantime-knowledge.webp', alt: 'Консультант объясняет коллеге рабочую инструкцию из базы знаний.' },
    en: { src: '/images/avantime-knowledge.webp', alt: 'A consultant explains a knowledge-base guide to a colleague.' },
    lv: { src: '/images/avantime-knowledge.webp', alt: 'Konsultants kolēģei skaidro darba instrukciju no zināšanu bāzes.' },
  },
};

export function getSectionImage(id: SectionImageId, locale: Locale) {
  return images[id][locale];
}

export function getSectionCardImage(id: SectionImageId, locale: Locale) {
  const cardSources: Partial<Record<SectionImageId, string>> = {
    'trade-management': '/images/avantime-onec.webp',
    accounting: '/images/avantime-accounting.webp',
    manufacturing: '/images/avantime-manufacturing.webp',
    'addressed-warehouse': '/images/avantime-addressed-warehouse.webp',
    platform: '/images/avantime-platform.webp',
    'agent-plus': '/images/avantime-agent-plus.webp',
  };
  const image = images[id][locale];
  return { ...image, src: cardSources[id] ?? image.src };
}
