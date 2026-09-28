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
  const cardSources: Partial<Record<SolutionCardImageId, string>> = {
    implementation: '/images/solution-cards/detailed-3d/08-implementation.webp',
    ai: '/images/solution-cards/detailed-3d/09-ai.webp',
    trade: '/images/solution-cards/detailed-3d/01-trade-management.webp',
    'mobile-sales': '/images/solution-cards/detailed-3d/05-agent-plus.webp',
    integrations: '/images/solution-cards/05-integrations-3d.webp',
    cloud: '/images/solution-cards/06-cloud-3d.webp',
    accounting: '/images/solution-cards/08-accounting-3d.webp',
    manufacturing: '/images/solution-cards/detailed-3d/04-upp.webp',
    warehouse: '/images/solution-cards/detailed-3d/03-address-warehouse.webp',
    platform: '/images/solution-cards/detailed-3d/10-1c-platform.webp',
    portals: '/images/solution-cards/07-portals-3d.webp',
  };
  return {
    src: cardSources[id] ?? `/images/solution-cards/${number}-${id}.webp`,
    width: 1672,
    height: 941,
    alt: titles[locale][id],
    title: titles[locale][id],
  };
}

export type SolutionCardImageVariant = {
  key: string;
  src: string;
  fileName: string;
};

export type OtherSolutionPreviewImage = {
  key: string;
  src: string;
  fileName: string;
};

export function getSolutionCardImageVariants(id: SolutionCardImageId): SolutionCardImageVariant[] | null {
  const number = {
    implementation: '01', ai: '02', trade: '03', 'mobile-sales': '04', integrations: '05', cloud: '06', portals: '07', accounting: '08', manufacturing: '09', warehouse: '10', platform: '11',
  }[id];
  const threeDSource: Partial<Record<SolutionCardImageId, string>> = {
    implementation: '/images/solution-cards/detailed-3d/08-implementation.webp',
    ai: '/images/solution-cards/detailed-3d/09-ai.webp',
    trade: '/images/solution-cards/detailed-3d/01-trade-management.webp',
    'mobile-sales': '/images/solution-cards/detailed-3d/05-agent-plus.webp',
    integrations: '/images/solution-cards/05-integrations-3d.webp',
    cloud: '/images/solution-cards/06-cloud-3d.webp',
    accounting: '/images/solution-cards/08-accounting-3d.webp',
    manufacturing: '/images/solution-cards/detailed-3d/04-upp.webp',
    warehouse: '/images/solution-cards/detailed-3d/03-address-warehouse.webp',
    platform: '/images/solution-cards/detailed-3d/10-1c-platform.webp',
  };
  const illustrationSource: Partial<Record<SolutionCardImageId, string>> = {
    implementation: '/images/avantime-onec.webp',
    ai: '/images/solution-cards/02-ai-illustration-original.png',
    trade: '/images/solution-cards/03-trade-illustration.webp',
    integrations: '/images/solution-cards/05-integrations-illustration.webp',
    cloud: '/images/solution-cards/06-cloud-illustration.webp',
    portals: '/images/solution-cards/07-portals-illustration.webp',
    accounting: '/images/solution-cards/08-accounting-illustration.webp',
  };
  const additionalSources: Partial<Record<SolutionCardImageId, { key: string; src: string; fileName: string }[]>> = {
    ai: [{ key: 'section', src: '/images/avantime-ai.webp', fileName: 'avantime-ai.webp' }],
    'mobile-sales': [{ key: 'photo2', src: '/images/solution-cards/04-mobile-sales-secondary.webp', fileName: '04-mobile-sales-secondary.webp' }, { key: 'section', src: '/images/avantime-agent-plus.webp', fileName: 'avantime-agent-plus.webp' }],
    manufacturing: [{ key: 'section', src: '/images/avantime-manufacturing.webp', fileName: 'avantime-manufacturing.webp' }],
    warehouse: [{ key: 'section', src: '/images/avantime-addressed-warehouse.webp', fileName: 'avantime-addressed-warehouse.webp' }],
    platform: [{ key: 'section', src: '/images/avantime-platform.webp', fileName: 'avantime-platform.webp' }],
    portals: [{ key: 'partnerPortal3D', src: '/images/solution-cards/detailed-3d/07-partner-portal.webp', fileName: '07-partner-portal.webp' }],
  };
  const variants: SolutionCardImageVariant[] = [
    { key: 'photo', src: `/images/solution-cards/${number}-${id}.webp`, fileName: `${number}-${id}.webp` },
    ...(threeDSource[id]
      ? [{ key: 'detailed3D', src: threeDSource[id], fileName: `${number}-${id}-detailed-3d.webp` }]
      : []),
    ...(illustrationSource[id]
      ? [{ key: 'illustration', src: illustrationSource[id], fileName: illustrationSource[id].split('/').pop() ?? '' }]
      : []),
    ...(additionalSources[id] ?? []),
  ];
  return variants.length > 1 ? variants : null;
}

export function getOtherSolutionPreviewImages(): OtherSolutionPreviewImage[] {
  return [
    { key: 'homepage', src: '/images/solution-preview/homepage.webp', fileName: 'homepage.webp' },
    { key: 'knowledge-base', src: '/images/solution-preview/knowledge-base.webp', fileName: 'knowledge-base.webp' },
    { key: 'home', src: '/images/avantime-home.webp', fileName: 'avantime-home.webp' },
    { key: 'homepage-hero', src: '/images/avantime-homepage-hero.webp', fileName: 'avantime-homepage-hero.webp' },
    { key: 'knowledge', src: '/images/avantime-knowledge.webp', fileName: 'avantime-knowledge.webp' },
  ];
}
