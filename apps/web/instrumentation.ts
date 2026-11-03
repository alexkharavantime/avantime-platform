export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCmsWarmup } = await import('./lib/cms-warmup');
    startCmsWarmup();
  }
}
