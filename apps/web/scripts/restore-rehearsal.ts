import { restorePostgreSQLRehearsal } from '../lib/backup-restore';
import { recordRecoveryOperation } from '../lib/recovery-operations';

async function main() {
  const execute = process.argv.includes('--execute');
  const archive = process.argv.find((argument) => argument.startsWith('--archive='))?.slice(10);
  if (!archive) {
    console.error(
      JSON.stringify({
        status: 'failed',
        errorCode: 'RESTORE_ARCHIVE_REQUIRED',
        message: '--archive=/absolute/path/to/archive.dump is required.',
      }),
    );
    process.exitCode = 2;
    return;
  }
  try {
    const result = await restorePostgreSQLRehearsal(process.env, archive, { execute });
    if (execute) {
      await recordRecoveryOperation({
        operationType: 'RESTORE_REHEARSAL',
        environment: process.env.BACKUP_ENVIRONMENT ?? '',
        status: 'SUCCEEDED',
        safeDetails: {
          targetDatabase: result.targetDatabase,
          encryptedArchive: true,
        },
        actorId: process.env.OPERATION_ACTOR_ID,
      });
    }
    console.log(
      JSON.stringify(
        {
          status: execute ? 'completed' : 'dry-run',
          component: 'restore-rehearsal',
          result,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        status: 'failed',
        component: 'restore-rehearsal',
        errorCode: 'RESTORE_REHEARSAL_FAILED',
        message: error instanceof Error ? error.message : 'Restore rehearsal failed.',
      }),
    );
    process.exitCode = 1;
  }
}

void main();
