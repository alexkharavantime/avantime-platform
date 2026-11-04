export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { enforceProductionStartupOrigin } = await import('./lib/site-public-origin');
    enforceProductionStartupOrigin();
    const { startCmsWarmup } = await import('./lib/cms-warmup');
    startCmsWarmup();
  }
}
