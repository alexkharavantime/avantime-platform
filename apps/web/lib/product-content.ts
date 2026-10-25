import en from '../content/en.json';
import lv from '../content/lv.json';
import ru from '../content/ru.json';
import type { Locale } from './i18n';

export type ProductContent = {
  name: string;
  headline: string;
  lead: string;
  cardText: string;
  benefits: { id: string; title: string; text: string }[];
  approachTitle: string;
  approachText: string;
  ctaText: string;
  ctaButton: string;
  seo: { title: string; description: string };
  imageId: string;
};

const content: Record<Locale, Record<string, ProductContent>> = { ru, lv, en };

export function getProductContent(locale: Locale, id: string) {
  return content[locale][id] ?? content.ru[id];
}
