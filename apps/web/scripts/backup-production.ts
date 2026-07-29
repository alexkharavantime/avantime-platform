import { createPostgreSQLBackup } from '../lib/backup-restore';
import { recordRecoveryOperation } from '../lib/recovery-operations';
import { loadDocumentIntegrationEnvironment } from './document-integration-environment';

async function main() {
  const execute = process.argv.includes('--execute');
  if (process.argv.includes('--integration')) {
    const { environment } = await loadDocumentIntegrationEnvironment();
    Object.assign(process.env, environment, {
      BACKUP_ENVIRONMENT: 'integration',
      BACKUP_OUTPUT_DIR: '/tmp/avantime-integration-backups',
      BACKUP_ENCRYPTION_REQUIRED: 'true',
      BACKUP_CONFIRMATION: 'BACKUP:integration',
    });
  }
  try {
    const result = await createPostgreSQLBackup(process.env, { execute });
    if (execute && 'sha256' in result) {
      await recordRecoveryOperation({
        operationType: 'BACKUP',
        environment: result.environment,
        status: 'SUCCEEDED',
        checksum: result.sha256,
        databaseBackupAt: new Date(),
        safeDetails: {
          bytes: result.bytes,
          manifestCreated: true,
          encrypted: result.encrypted,
        },
        actorId: process.env.OPERATION_ACTOR_ID,
      });
    }
    console.log(
      JSON.stringify(
        {
          status: execute ? 'completed' : 'dry-run',
          component: 'postgresql-backup',
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
        component: 'postgresql-backup',
        errorCode: 'BACKUP_FAILED',
        message: error instanceof Error ? error.message : 'Backup failed.',
      }),
    );
    process.exitCode = 1;
  }
}

void main();
