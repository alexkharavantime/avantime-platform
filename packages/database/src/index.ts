let client: unknown;

export async function getPrisma(): Promise<any | null> {
  if (!process.env.DATABASE_URL) return null;
  if (client) return client;

  try {
    const load = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
    const module = await load('@prisma/client');
    client = new module.PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
    return client;
  } catch (error) {
    console.warn('Prisma Client is not generated; using the demo request store.', error);
    return null;
  }
}
