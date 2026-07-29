import { getPrisma } from '@avantime/database';

export type AiCostSummary = {
  companyId: string;
  day: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  embeddingUnits: number;
  estimatedCostEur: number;
  actualCostEur: number | null;
};

export async function getAiCostSummary(options: {
  companyId?: string;
  from?: Date;
  to?: Date;
}): Promise<AiCostSummary[]> {
  const database = (await getPrisma()) as {
    $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  } | null;
  if (!database) throw new Error('AI cost ledger database is unavailable.');
  const from = options.from ?? new Date(Date.now() - 31 * 86_400_000);
  const to = options.to ?? new Date();
  const rows = await database.$queryRawUnsafe<
    Array<{
      companyId: string;
      day: Date;
      requestCount: bigint;
      inputTokens: bigint;
      outputTokens: bigint;
      embeddingUnits: bigint;
      estimatedCostEur: string;
      actualCostEur: string | null;
    }>
  >(
    `SELECT "companyId", date_trunc('day', "occurredAt") AS "day",
       COUNT(*) AS "requestCount", SUM("inputTokens") AS "inputTokens",
       SUM("outputTokens") AS "outputTokens", SUM("embeddingUnits") AS "embeddingUnits",
       SUM("estimatedCostEur")::text AS "estimatedCostEur",
       CASE WHEN COUNT("actualCostEur") = 0 THEN NULL
         ELSE SUM("actualCostEur")::text END AS "actualCostEur"
     FROM "AiUsageLedger"
     WHERE "occurredAt" >= $1 AND "occurredAt" < $2
       AND ($3::text IS NULL OR "companyId" = $3)
     GROUP BY "companyId", date_trunc('day', "occurredAt")
     ORDER BY "day" DESC, "companyId"`,
    from,
    to,
    options.companyId ?? null,
  );
  return rows.map((row) => ({
    companyId: row.companyId,
    day: row.day.toISOString().slice(0, 10),
    requestCount: Number(row.requestCount),
    inputTokens: Number(row.inputTokens),
    outputTokens: Number(row.outputTokens),
    embeddingUnits: Number(row.embeddingUnits),
    estimatedCostEur: Number(row.estimatedCostEur),
    actualCostEur: row.actualCostEur === null ? null : Number(row.actualCostEur),
  }));
}
