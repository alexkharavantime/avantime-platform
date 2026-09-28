import type { Locale } from './i18n';

export type SectionImageId = 'home' | 'homepage-hero' | 'onec' | 'trade-management' | 'accounting' | 'manufacturing' | 'addressed-warehouse' | 'platform' | 'agent-plus' | 'ai' | 'integrations' | 'cloud' | 'portals' | 'knowledge' | 'assistant';

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
    ru: { src: '/images/avantime-1c-implementation-hero-v2.webp', alt: 'Внедрение 1С: проектирование процессов, рабочие места пользователей, серверная и склад.' },
    en: { src: '/images/avantime-1c-implementation-hero-v2.webp', alt: '1C implementation: process design, user workstations, server infrastructure and warehouse.' },
    lv: { src: '/images/avantime-1c-implementation-hero-v2.webp', alt: '1C ieviešana: procesu projektēšana, lietotāju darba vietas, serveru infrastruktūra un noliktava.' },
  },
  'trade-management': {
    ru: { src: '/images/solution-cards/detailed-3d/01-trade-management.webp', alt: 'Детальная 3D-иллюстрация управления торговлей: продажи, товары и склад.' },
    en: { src: '/images/solution-cards/detailed-3d/01-trade-management.webp', alt: 'Detailed 3D illustration of trade management with sales, goods and warehouse operations.' },
    lv: { src: '/images/solution-cards/detailed-3d/01-trade-management.webp', alt: 'Detalizēta 3D ilustrācija tirdzniecības vadībai ar pārdošanu, precēm un noliktavu.' },
  },
  accounting: {
    ru: { src: '/images/solution-cards/08-accounting-3d.webp', alt: 'Детальная 3D-иллюстрация бухгалтерии предприятия, документов и учёта.' },
    en: { src: '/images/solution-cards/08-accounting-3d.webp', alt: 'Detailed 3D illustration of enterprise accounting, documents and records.' },
    lv: { src: '/images/solution-cards/08-accounting-3d.webp', alt: 'Detalizēta 3D ilustrācija uzņēmuma grāmatvedībai, dokumentiem un uzskaitei.' },
  },
  manufacturing: {
    ru: { src: '/images/solution-cards/detailed-3d/04-upp.webp', alt: 'Детальная 3D-иллюстрация УПП: производство, материалы и выпуск продукции.' },
    en: { src: '/images/solution-cards/detailed-3d/04-upp.webp', alt: 'Detailed 3D illustration of manufacturing, materials and finished goods.' },
    lv: { src: '/images/solution-cards/detailed-3d/04-upp.webp', alt: 'Detalizēta 3D ilustrācija ražošanai, materiāliem un gatavai produkcijai.' },
  },
  'addressed-warehouse': {
    ru: { src: '/images/solution-cards/detailed-3d/03-address-warehouse.webp', alt: 'Детальная 3D-иллюстрация адресного склада, ячеек и подбора товаров.' },
    en: { src: '/images/solution-cards/detailed-3d/03-address-warehouse.webp', alt: 'Detailed 3D illustration of an address warehouse, bins and order picking.' },
    lv: { src: '/images/solution-cards/detailed-3d/03-address-warehouse.webp', alt: 'Detalizēta 3D ilustrācija adresu noliktavai, šūnām un preču komplektēšanai.' },
  },
  platform: {
    ru: { src: '/images/solution-cards/detailed-3d/10-1c-platform.webp', alt: 'Детальная 3D-иллюстрация платформы 1С и связанных бизнес-модулей.' },
    en: { src: '/images/solution-cards/detailed-3d/10-1c-platform.webp', alt: 'Detailed 3D illustration of the 1C platform and connected business modules.' },
    lv: { src: '/images/solution-cards/detailed-3d/10-1c-platform.webp', alt: 'Detalizēta 3D ilustrācija 1C platformai un saistītajiem biznesa moduļiem.' },
  },
  'agent-plus': {
    ru: { src: '/images/solution-cards/detailed-3d/05-agent-plus.webp', alt: 'Детальная 3D-иллюстрация Agent+ и мобильной работы торгового представителя.' },
    en: { src: '/images/solution-cards/detailed-3d/05-agent-plus.webp', alt: 'Detailed 3D illustration of Agent+ and mobile work for a sales representative.' },
    lv: { src: '/images/solution-cards/detailed-3d/05-agent-plus.webp', alt: 'Detalizēta 3D ilustrācija Agent+ un mobilajam tirdzniecības pārstāvja darbam.' },
  },
  ai: {
    ru: { src: '/images/solution-cards/detailed-3d/09-ai.webp', alt: 'Детальная 3D-иллюстрация применения искусственного интеллекта в бизнесе.' },
    en: { src: '/images/solution-cards/detailed-3d/09-ai.webp', alt: 'Detailed 3D illustration of artificial intelligence applied to business.' },
    lv: { src: '/images/solution-cards/detailed-3d/09-ai.webp', alt: 'Detalizēta 3D ilustrācija mākslīgā intelekta izmantošanai uzņēmumā.' },
  },
  integrations: {
    ru: { src: '/images/solution-cards/05-integrations-3d.webp', alt: 'Детальная 3D-иллюстрация интеграций и обмена данными между системами.' },
    en: { src: '/images/solution-cards/05-integrations-3d.webp', alt: 'Detailed 3D illustration of integrations and data exchange between systems.' },
    lv: { src: '/images/solution-cards/05-integrations-3d.webp', alt: 'Detalizēta 3D ilustrācija integrācijām un datu apmaiņai starp sistēmām.' },
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
    ru: { src: '/images/avantime-knowledge-base-3d.webp', alt: 'Детальная 3D-иллюстрация базы знаний: документы, поиск и рабочие материалы.' },
    en: { src: '/images/avantime-knowledge-base-3d.webp', alt: 'Detailed 3D illustration of a knowledge base with documents, search and work materials.' },
    lv: { src: '/images/avantime-knowledge-base-3d.webp', alt: 'Detalizēta 3D ilustrācija zināšanu bāzei ar dokumentiem, meklēšanu un darba materiāliem.' },
  },
  assistant: {
    ru: { src: '/images/avantime-ai-consultant-3d.webp', alt: 'Детальная 3D-иллюстрация AI-консультанта: диалог пользователя и пошаговая помощь.' },
    en: { src: '/images/avantime-ai-consultant-3d.webp', alt: 'Detailed 3D illustration of an AI consultant with a user dialogue and step-by-step help.' },
    lv: { src: '/images/avantime-ai-consultant-3d.webp', alt: 'Detalizēta 3D ilustrācija AI konsultantam ar lietotāja dialogu un pakāpenisku palīdzību.' },
  },
};

export function getSectionImage(id: SectionImageId, locale: Locale) {
  return images[id][locale];
}

export function getSectionCardImage(id: SectionImageId, locale: Locale) {
  const cardSources: Partial<Record<SectionImageId, string>> = {
    'trade-management': '/images/solution-cards/detailed-3d/01-trade-management.webp',
    accounting: '/images/solution-cards/08-accounting-3d.webp',
    manufacturing: '/images/solution-cards/detailed-3d/04-upp.webp',
    'addressed-warehouse': '/images/solution-cards/detailed-3d/03-address-warehouse.webp',
    platform: '/images/solution-cards/detailed-3d/10-1c-platform.webp',
    'agent-plus': '/images/solution-cards/detailed-3d/05-agent-plus.webp',
  };
  const image = images[id][locale];
  return { ...image, src: cardSources[id] ?? image.src };
}
