import { getPrisma } from '@avantime/database';

export type SystemEventItem = {
  id: string;
  level: string;
  category: string;
  message: string;
  actorEmail?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
};
const demoEvents: SystemEventItem[] = [];

export async function recordSystemEvent(input: Omit<SystemEventItem, 'id' | 'createdAt'>) {
  if (process.env.DATABASE_URL) {
    try {
      const prisma = await getPrisma();
      if (prisma) {
        const item = await prisma.systemEvent.create({ data: input });
        return { ...item, createdAt: item.createdAt.toISOString() } as SystemEventItem;
      }
    } catch (error) {
      console.warn('Cannot persist system event.', error);
    }
  }
  const item = { id: `event-${Date.now()}`, ...input, createdAt: new Date().toISOString() };
  demoEvents.unshift(item);
  return item;
}

export async function listSystemEvents(limit = 100): Promise<SystemEventItem[]> {
  if (process.env.DATABASE_URL) {
    try {
      const prisma = await getPrisma();
      if (prisma) {
        const items = await prisma.systemEvent.findMany({
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        return items.map(
          (item: {
            id: string;
            level: string;
            category: string;
            message: string;
            actorEmail?: string | null;
            createdAt: Date;
          }) => ({ ...item, createdAt: item.createdAt.toISOString() }),
        );
      }
    } catch (error) {
      console.warn('Cannot load system events.', error);
    }
  }
  return demoEvents.slice(0, limit);
}
