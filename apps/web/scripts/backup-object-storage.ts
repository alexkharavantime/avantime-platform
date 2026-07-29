import { backupObjectStorage } from '../lib/object-storage-backup';
import { recordRecoveryOperation } from '../lib/recovery-operations';
import { loadDocumentIntegrationEnvironment } from './document-integration-environment';

async function main() {
  const execute = process.argv.includes('--execute');
  if (process.argv.includes('--integration')) {
    const { environment } = await loadDocumentIntegrationEnvironment();
    Object.assign(process.env, environment, {
      BACKUP_ENVIRONMENT: 'integration',
      BACKUP_CONFIRMATION: 'BACKUP:integration',
      BACKUP_OBJECT_STORAGE_BUCKET: 'avantime-backups-integration',
    });
  }
  try {
    const result = await backupObjectStorage(process.env, { execute });
    if (execute) {
      await recordRecoveryOperation({
        operationType: 'OBJECT_BACKUP',
        environment: process.env.BACKUP_ENVIRONMENT ?? '',
        status: 'SUCCEEDED',
        checksum: result.manifestChecksum,
        objectCount: result.objectCount,
        objectBackupAt: new Date(),
        safeDetails: {
          totalBytes: result.totalBytes,
          encryption: result.encryption,
        },
        actorId: process.env.OPERATION_ACTOR_ID,
      });
    }
    console.log(
      JSON.stringify({
        status: execute ? 'completed' : 'dry-run',
        component: 'object-storage-backup',
        result,
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        status: 'failed',
        component: 'object-storage-backup',
        errorCode: 'OBJECT_BACKUP_FAILED',
        message: error instanceof Error ? error.message : 'Object backup failed.',
      }),
    );
    process.exitCode = 1;
  }
}

void main();
