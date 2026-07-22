/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPrisma } from '@avantime/database';
import { articles as staticArticles, type Article } from './content';

export type KnowledgeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type KnowledgeArticle = Article & {
  id: string;
  tags: string[];
  status: KnowledgeStatus;
  publishedAt?: string;
  updatedAt: string;
};

const demoArticles: KnowledgeArticle[] = staticArticles.map((article, index) => ({
  ...article,
  id: `demo-article-${index + 1}`,
  tags: [article.category, ...article.title.split(' ').filter((word) => word.length > 5).slice(0, 3)],
  status: 'PUBLISHED',
  publishedAt: new Date(Date.UTC(2026, 6, 10 + index)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 6, 10 + index)).toISOString(),
}));

function databaseConfigured() { return Boolean(process.env.DATABASE_URL); }
function mapDbArticle(item: any): KnowledgeArticle {
  const sections = Array.isArray(item.content) ? item.content : [];
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    category: item.category,
    tags: item.tags ?? [],
    readingTime: item.readingTime,
    sections,
    status: item.status,
    publishedAt: item.publishedAt?.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function listKnowledgeArticles(options: { includeDrafts?: boolean; query?: string; category?: string } = {}) {
  const { includeDrafts = false, query = '', category = '' } = options;
  let items: KnowledgeArticle[];
  if (databaseConfigured()) {
    try {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('Prisma unavailable');
      const rows = await prisma.knowledgeArticle.findMany({
        where: { ...(includeDrafts ? {} : { status: 'PUBLISHED' }), ...(category ? { category } : {}) },
        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
      });
      items = rows.map(mapDbArticle);
    } catch (error) {
      console.warn('Knowledge database unavailable, using demo content.', error);
      items = [...demoArticles];
    }
  } else items = [...demoArticles];

  const normalized = query.trim().toLowerCase();
  return items.filter((item) => {
    const statusOk = includeDrafts || item.status === 'PUBLISHED';
    const categoryOk = !category || item.category === category;
    const queryOk = !normalized || `${item.title} ${item.summary} ${item.category} ${item.tags.join(' ')}`.toLowerCase().includes(normalized);
    return statusOk && categoryOk && queryOk;
  });
}

export async function getKnowledgeArticle(slug: string, includeDrafts = false) {
  const items = await listKnowledgeArticles({ includeDrafts });
  return items.find((item) => item.slug === slug) ?? null;
}

export async function createKnowledgeArticle(input: { title: string; slug: string; summary: string; category: string; tags: string[]; readingTime: string; body: string; authorId?: string }) {
  const sections = input.body.split(/\n\s*\n/).map((block, index) => ({ title: index === 0 ? 'Основное' : `Раздел ${index + 1}`, paragraphs: block.split('\n').map((p) => p.trim()).filter(Boolean) })).filter((s) => s.paragraphs.length);
  if (databaseConfigured()) {
    const prisma = await getPrisma();
    if (prisma) {
      const row = await prisma.knowledgeArticle.create({ data: { slug: input.slug, title: input.title, summary: input.summary, category: input.category, tags: input.tags, readingTime: input.readingTime || '5 минут', content: sections, authorId: input.authorId } });
      return mapDbArticle(row);
    }
  }
  const article: KnowledgeArticle = { id: `demo-${Date.now()}`, slug: input.slug, title: input.title, summary: input.summary, category: input.category, tags: input.tags, readingTime: input.readingTime || '5 минут', sections, status: 'DRAFT', updatedAt: new Date().toISOString() };
  demoArticles.unshift(article);
  return article;
}

export async function setKnowledgeArticleStatus(id: string, status: KnowledgeStatus) {
  if (databaseConfigured()) {
    const prisma = await getPrisma();
    if (prisma) {
      const row = await prisma.knowledgeArticle.update({ where: { id }, data: { status, publishedAt: status === 'PUBLISHED' ? new Date() : undefined } });
      return mapDbArticle(row);
    }
  }
  const item = demoArticles.find((article) => article.id === id);
  if (!item) return null;
  item.status = status;
  item.publishedAt = status === 'PUBLISHED' ? new Date().toISOString() : item.publishedAt;
  item.updatedAt = new Date().toISOString();
  return item;
}

export async function findRelatedArticles(text: string, limit = 3) {
  const items = await listKnowledgeArticles();
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2);
  return items.map((item) => {
    const haystack = `${item.title} ${item.summary} ${item.category} ${item.tags.join(' ')}`.toLowerCase();
    const score = words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0);
    return { item, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(({ item }) => item);
}
