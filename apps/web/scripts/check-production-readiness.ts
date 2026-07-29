import { getPrisma } from '@avantime/database';

import { PostgreSQLAiCostController } from '../lib/ai-control';
import { validateProductionConfiguration } from '../lib/production-configuration';
import { createRedisCommandClient } from '../lib/redis-lease-queue';

async function main() {
  let client: Awaited<ReturnType<typeof createRedisCommandClient>> | undefined;
  try {
    const configuration = validateProductionConfiguration();
    client = await createRedisCommandClient(process.env.REDIS_URL ?? '');
    const redisReady = String(await client.sendCommand(['PING'])) === 'PONG';
    const cost = new PostgreSQLAiCostController(
      async () => await getPrisma(),
      Number(process.env.AI_DAILY_BUDGET_EUR || 0),
      Number(process.env.AI_MONTHLY_BUDGET_EUR || 0),
    );
    const ledgerReady = await cost.checkReadiness();
    const ready = redisReady && ledgerReady;
    console.log(
      JSON.stringify({
        status: ready ? 'ready' : 'unavailable',
        configuration,
        components: {
          redis: redisReady ? 'ready' : 'unavailable',
          aiCostLedger: ledgerReady ? 'ready' : 'unavailable',
        },
      }),
    );
    if (!ready) process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        status: 'unavailable',
        errorCode: 'PRODUCTION_READINESS_FAILED',
        message: error instanceof Error ? error.message : 'Production readiness failed.',
      }),
    );
    process.exitCode = 1;
  } finally {
    await client?.close?.();
  }
}

void main();
