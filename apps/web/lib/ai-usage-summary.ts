import type { PrismaClient } from '@prisma/client';

export type AiUsageSummaryOperation = {
  requestType: string;
  provider: string;
  status: string;
  operationCount: number;
  inputTokens: string;
  outputTokens: string;
  embeddingUnits: string;
  estimatedCostEur: number;
  actualCostEur: number | null;
};

export type AiUsageSummaryReservation = {
  provider: string;
  status: string;
  reservationCount: number;
  reservedCostEur: number;
};

export async function readAiUsageSummary(prisma: PrismaClient) {
  const operations = await prisma.$queryRaw<AiUsageSummaryOperation[]>`
    SELECT
      "requestType",
      "provider",
      "status",
      COUNT(*)::int AS "operationCount",
      COALESCE(SUM("inputTokens"), 0)::text AS "inputTokens",
      COALESCE(SUM("outputTokens"), 0)::text AS "outputTokens",
      COALESCE(SUM("embeddingUnits"), 0)::text AS "embeddingUnits",
      COALESCE(SUM("estimatedCostEur"), 0)::float8 AS "estimatedCostEur",
      CASE WHEN COUNT("actualCostEur") = COUNT(*) THEN SUM("actualCostEur")::float8
        ELSE NULL END AS "actualCostEur"
    FROM "AiUsageLedger"
    GROUP BY "requestType", "provider", "status"
    ORDER BY "requestType", "provider", "status"
  `;
  const reservations = await prisma.$queryRaw<AiUsageSummaryReservation[]>`
    SELECT "provider", "status", COUNT(*)::int AS "reservationCount",
      COALESCE(SUM("estimatedCostEur"), 0)::float8 AS "reservedCostEur"
    FROM "AiBudgetReservation"
    GROUP BY "provider", "status"
    ORDER BY "provider", "status"
  `;

  return { operations, reservations };
}