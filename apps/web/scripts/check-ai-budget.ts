import { getPrisma } from '@avantime/database';

async function main() {
  try {
    const database = (await getPrisma()) as {
      $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
    } | null;
    if (!database) throw new Error('AI budget database is unavailable.');
    const rows = await database.$queryRawUnsafe<
      Array<{
        companyId: string;
        dailyLimitEur: string;
        monthlyLimitEur: string;
        monthUsageEur: string;
        activeReservationsEur: string;
      }>
    >(
      `SELECT p."companyId", p."dailyLimitEur"::text AS "dailyLimitEur",
       p."monthlyLimitEur"::text AS "monthlyLimitEur",
       COALESCE((
         SELECT SUM(COALESCE(l."actualCostEur", l."estimatedCostEur"))
         FROM "AiUsageLedger" l
         WHERE l."companyId" = p."companyId"
           AND l."occurredAt" >= date_trunc('month', CURRENT_TIMESTAMP)
           AND l."status" = 'SUCCEEDED'
       ), 0)::text AS "monthUsageEur",
       COALESCE((
         SELECT SUM(r."estimatedCostEur") FROM "AiBudgetReservation" r
         WHERE r."companyId" = p."companyId" AND r."status" = 'RESERVED'
           AND r."expiresAt" > CURRENT_TIMESTAMP
       ), 0)::text AS "activeReservationsEur"
     FROM "AiBudgetPolicy" p ORDER BY p."companyId"`,
    );
    const budgets = rows.map((row) => {
      const limit = Number(row.monthlyLimitEur);
      const committed = Number(row.monthUsageEur) + Number(row.activeReservationsEur);
      return {
        companyId: row.companyId,
        dailyLimitEur: Number(row.dailyLimitEur),
        monthlyLimitEur: limit,
        committedEur: committed,
        utilization: limit > 0 ? Number((committed / limit).toFixed(4)) : 0,
      };
    });
    console.log(JSON.stringify({ status: 'ready', currency: 'EUR', budgets }));
  } catch {
    console.error(JSON.stringify({ status: 'unavailable', errorCode: 'AI_BUDGET_UNAVAILABLE' }));
    process.exitCode = 1;
  }
}

void main();
