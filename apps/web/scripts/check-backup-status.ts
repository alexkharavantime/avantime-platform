import { getPrisma } from '@avantime/database';

const maximumAgeHours = Number(process.env.BACKUP_MAXIMUM_AGE_HOURS || 24);

async function main() {
  try {
    const database = (await getPrisma()) as {
      $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
    } | null;
    if (!database) throw new Error('Recovery metadata database is unavailable.');
    const rows = await database.$queryRawUnsafe<
      Array<{ completedAt: Date; status: string; checksum: string | null }>
    >(
      `SELECT "completedAt", "status", "checksum"
     FROM "RecoveryOperation"
     WHERE "operationType" = 'BACKUP' AND "status" = 'SUCCEEDED'
     ORDER BY "completedAt" DESC NULLS LAST LIMIT 1`,
    );
    const latest = rows[0];
    const ageHours = latest?.completedAt
      ? (Date.now() - latest.completedAt.getTime()) / 3_600_000
      : Number.POSITIVE_INFINITY;
    const ready = Boolean(latest?.checksum && ageHours <= maximumAgeHours);
    console.log(
      JSON.stringify({
        status: ready ? 'ready' : 'unavailable',
        component: 'backup',
        ageHours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(2)) : null,
        checksumRecorded: Boolean(latest?.checksum),
      }),
    );
    if (!ready) process.exitCode = 1;
  } catch {
    console.error(
      JSON.stringify({
        status: 'unavailable',
        component: 'backup',
        errorCode: 'BACKUP_STATUS_UNAVAILABLE',
      }),
    );
    process.exitCode = 1;
  }
}

void main();
