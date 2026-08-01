/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPrisma } from '@avantime/database';
import { articles as staticArticles, type Article } from './content';
import type { AppSession } from './session';

export type KnowledgeStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type KnowledgeOwnerScope = 'PLATFORM' | 'ORGANIZATION' | 'SYSTEM' | 'LEGACY_UNCLASSIFIED';
export type KnowledgeVisibility = 'PRIVATE' | 'ORGANIZATION' | 'PLATFORM' | 'PUBLIC';
export type KnowledgeArticle = Article & {
  id: string;
  tags: string[];
  status: KnowledgeStatus;
  publishedAt?: string;
  updatedAt: string;
  companyId?: string;
  ownerScope: KnowledgeOwnerScope;
  visibility: KnowledgeVisibility;
  version: number;
};

const demoArticles: KnowledgeArticle[] = staticArticles.map((article, index) => ({
  ...article,
  id: `demo-article-${index + 1}`,
  tags: [
    article.category,
    ...article.title
      .split(' ')
      .filter((word) => word.length > 5)
      .slice(0, 3),
  ],
  status: 'PUBLISHED',
  publishedAt: new Date(Date.UTC(2026, 6, 10 + index)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 6, 10 + index)).toISOString(),
  ownerScope: 'PLATFORM',
  visibility: 'PUBLIC',
  version: 1,
}));

function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
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
    companyId: item.companyId ?? undefined,
    ownerScope: item.ownerScope,
    visibility: item.visibility,
    version: item.version,
  };
}

export type KnowledgeAudience =
  { kind: 'PUBLIC' } | { kind: 'ORGANIZATION'; companyId: string } | { kind: 'PLATFORM' };

export async function listKnowledgeArticles(
  options: {
    includeDrafts?: boolean;
    query?: string;
    category?: string;
    audience?: KnowledgeAudience;
  } = {},
) {
  const {
    includeDrafts = false,
    query = '',
    category = '',
    audience = { kind: 'PUBLIC' },
  } = options;
  let items: KnowledgeArticle[];
  if (databaseConfigured()) {
    try {
      const prisma = await getPrisma();
      if (!prisma) throw new Error('Prisma unavailable');
      const rows = await prisma.knowledgeArticle.findMany({
        where: {
          quarantinedAt: null,
          ...(audience.kind === 'PUBLIC'
            ? { status: 'PUBLISHED', visibility: 'PUBLIC' }
            : audience.kind === 'PLATFORM'
              ? {
                  ownerScope: 'PLATFORM',
                  ...(includeDrafts ? {} : { status: 'PUBLISHED' }),
                }
              : {
                  OR: [
                    {
                      ownerScope: 'ORGANIZATION',
                      companyId: audience.companyId,
                      status: 'PUBLISHED',
                      visibility: { in: ['ORGANIZATION', 'PUBLIC'] },
                    },
                    {
                      ownerScope: 'PLATFORM',
                      status: 'PUBLISHED',
                      visibility: { in: ['PLATFORM', 'PUBLIC'] },
                    },
                  ],
                }),
          ...(category ? { category } : {}),
        },
        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
      });
      items = rows.map(mapDbArticle);
    } catch {
      // A configured database is an authorization boundary. Falling back to bundled public
      // content here would hide persistence failures and could return the wrong audience.
      console.warn('Knowledge database unavailable.');
      throw new Error('KNOWLEDGE_DATABASE_UNAVAILABLE');
    }
  } else items = [...demoArticles];

  const normalized = query.trim().toLowerCase();
  return items.filter((item) => {
    const statusOk = includeDrafts || item.status === 'PUBLISHED';
    const categoryOk = !category || item.category === category;
    const queryOk =
      !normalized ||
      `${item.title} ${item.summary} ${item.category} ${item.tags.join(' ')}`
        .toLowerCase()
        .includes(normalized);
    return statusOk && categoryOk && queryOk;
  });
}

export async function getKnowledgeArticle(
  slug: string,
  includeDrafts = false,
  audience: KnowledgeAudience = { kind: 'PUBLIC' },
) {
  const items = await listKnowledgeArticles({ includeDrafts, audience });
  return items.find((item) => item.slug === slug) ?? null;
}

export async function createKnowledgeArticle(input: {
  title: string;
  slug: string;
  summary: string;
  category: string;
  tags: string[];
  readingTime: string;
  body: string;
  authorId?: string;
  ownerScope?: Extract<KnowledgeOwnerScope, 'PLATFORM' | 'ORGANIZATION'>;
  companyId?: string;
  visibility?: KnowledgeVisibility;
}) {
  const sections = input.body
    .split(/\n\s*\n/)
    .map((block, index) => ({
      title: index === 0 ? 'Основное' : `Раздел ${index + 1}`,
      paragraphs: block
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean),
    }))
    .filter((s) => s.paragraphs.length);
  if (databaseConfigured()) {
    const prisma = await getPrisma();
    if (prisma) {
      const row = await prisma.knowledgeArticle.create({
        data: {
          slug: input.slug,
          title: input.title,
          summary: input.summary,
          category: input.category,
          tags: input.tags,
          readingTime: input.readingTime || '5 минут',
          content: sections,
          authorId: input.authorId,
          ownerScope: input.ownerScope ?? 'PLATFORM',
          companyId: input.ownerScope === 'ORGANIZATION' ? input.companyId : null,
          visibility: input.visibility ?? 'PRIVATE',
          classificationEvidence: 'task-012-server-created-v1',
        },
      });
      return mapDbArticle(row);
    }
  }
  const article: KnowledgeArticle = {
    id: `demo-${Date.now()}`,
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    category: input.category,
    tags: input.tags,
    readingTime: input.readingTime || '5 минут',
    sections,
    status: 'DRAFT',
    updatedAt: new Date().toISOString(),
    companyId: input.ownerScope === 'ORGANIZATION' ? input.companyId : undefined,
    ownerScope: input.ownerScope ?? 'PLATFORM',
    visibility: input.visibility ?? 'PRIVATE',
    version: 1,
  };
  demoArticles.unshift(article);
  return article;
}

export async function setKnowledgeArticleStatus(
  id: string,
  status: KnowledgeStatus,
  expectedVersion: number,
) {
  if (databaseConfigured()) {
    const prisma = await getPrisma();
    if (prisma) {
      const updated = await prisma.knowledgeArticle.updateMany({
        where: { id, ownerScope: 'PLATFORM', version: expectedVersion, quarantinedAt: null },
        data: {
          status,
          publishedAt: status === 'PUBLISHED' ? new Date() : undefined,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return null;
      const row = await prisma.knowledgeArticle.findUnique({ where: { id } });
      if (!row) return null;
      return mapDbArticle(row);
    }
  }
  const item = demoArticles.find((article) => article.id === id);
  if (!item) return null;
  item.status = status;
  item.publishedAt = status === 'PUBLISHED' ? new Date().toISOString() : item.publishedAt;
  item.updatedAt = new Date().toISOString();
  item.version += 1;
  return item;
}

export async function setOrganizationKnowledgeArticleStatus(input: {
  session: AppSession;
  id: string;
  status: KnowledgeStatus;
  expectedVersion: number;
}) {
  if (!input.session.companyId) return null;
  const prisma = await getPrisma();
  if (!prisma) return null;
  const changed = await prisma.knowledgeArticle.updateMany({
    where: {
      id: input.id,
      ownerScope: 'ORGANIZATION',
      companyId: input.session.companyId,
      version: input.expectedVersion,
      quarantinedAt: null,
    },
    data: {
      status: input.status,
      publishedAt: input.status === 'PUBLISHED' ? new Date() : undefined,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) return null;
  return prisma.knowledgeArticle.findUnique({ where: { id: input.id } });
}

export async function findRelatedArticles(text: string, limit = 3) {
  const items = await listKnowledgeArticles();
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2);
  return items
    .map((item) => {
      const haystack =
        `${item.title} ${item.summary} ${item.category} ${item.tags.join(' ')}`.toLowerCase();
      const score = words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0);
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}
