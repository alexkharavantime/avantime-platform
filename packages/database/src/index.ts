const prismaGlobal = globalThis as typeof globalThis & {
  avantimePrismaClient?: unknown;
};

export async function getPrisma(): Promise<any | null> {
  if (!process.env.DATABASE_URL) return null;
  if (prismaGlobal.avantimePrismaClient) return prismaGlobal.avantimePrismaClient;

  try {
    const load = new Function('specifier', 'return import(specifier)') as (
      specifier: string,
    ) => Promise<any>;
    const module = await load('@prisma/client');
    const transactionTimeout = Number(process.env.DATABASE_TRANSACTION_TIMEOUT_MS ?? 5_000);
    const poolTimeoutSeconds = Number(process.env.DATABASE_POOL_TIMEOUT_SECONDS ?? 2);
    if (
      !Number.isSafeInteger(transactionTimeout) ||
      transactionTimeout < 100 ||
      !Number.isSafeInteger(poolTimeoutSeconds) ||
      poolTimeoutSeconds < 1
    ) {
      throw new Error('Database timeout configuration is invalid.');
    }
    prismaGlobal.avantimePrismaClient = new module.PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      transactionOptions: {
        maxWait: poolTimeoutSeconds * 1_000,
        timeout: transactionTimeout,
      },
    });
    return prismaGlobal.avantimePrismaClient;
  } catch (error) {
    console.warn('Prisma Client is not generated; using the demo request store.', error);
    return null;
  }
}
