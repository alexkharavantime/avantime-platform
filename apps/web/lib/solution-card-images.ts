import type { Locale } from './i18n';

export type SolutionCardImageId =
  | 'implementation'
  | 'ai'
  | 'trade'
  | 'mobile-sales'
  | 'integrations'
  | 'cloud'
  | 'portals'
  | 'accounting'
  | 'manufacturing'
  | 'warehouse'
  | 'platform';

const titles: Record<Locale, Record<SolutionCardImageId, string>> = {
  ru: {
    implementation: 'Внедрение и развитие 1С', ai: 'AI для бизнес-процессов', trade: 'Управление торговлей', 'mobile-sales': 'Agent+ и мобильная торговля', integrations: 'Интеграции и ЭДО', cloud: 'Облачная инфраструктура', portals: 'Кабинеты и корпоративные порталы', accounting: 'Бухгалтерия предприятия', manufacturing: 'Управление производственным предприятием', warehouse: 'Адресный склад', platform: 'Платформа 1С:Предприятие',
  },
  en: {
    implementation: '1C implementation and development', ai: 'AI for business processes', trade: 'Trade Management', 'mobile-sales': 'Agent+ and mobile sales', integrations: 'Integrations and EDI', cloud: 'Cloud infrastructure', portals: 'Client portals and corporate platforms', accounting: 'Enterprise Accounting', manufacturing: 'Manufacturing Enterprise Management', warehouse: 'Address Warehouse', platform: '1C platform',
  },
  lv: {
    implementation: '1C ieviešana un attīstība', ai: 'AI biznesa procesiem', trade: 'Tirdzniecības vadība', 'mobile-sales': 'Agent+ un mobilā tirdzniecība', integrations: 'Integrācijas un EDI', cloud: 'Mākoņa infrastruktūra', portals: 'Klientu kabineti un korporatīvie portāli', accounting: 'Uzņēmuma grāmatvedība', manufacturing: 'Ražošanas uzņēmuma vadība', warehouse: 'Adresu noliktava', platform: '1C platforma',
  },
};

export function getSolutionCardImage(id: SolutionCardImageId, locale: Locale) {
  const number = {
    implementation: '01', ai: '02', trade: '03', 'mobile-sales': '04', integrations: '05', cloud: '06', portals: '07', accounting: '08', manufacturing: '09', warehouse: '10', platform: '11',
  }[id];
  return {
    src: `/images/solution-cards/${number}-${id}.webp`,
    width: 1672,
    height: 941,
    alt: '',
    title: titles[locale][id],
  };
}
