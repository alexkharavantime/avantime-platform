import { retryDeadLetterNotification } from '../lib/notification-outbox';

const [command, id] = process.argv.slice(2);
if (command !== 'retry' || !id) {
  console.error(JSON.stringify({ status: 'failed', code: 'USAGE_RETRY_ID_REQUIRED' }));
  process.exitCode = 1;
} else {
  retryDeadLetterNotification(id)
    .then(() => console.info(JSON.stringify({ status: 'passed', operation: 'retry', id })))
    .catch((error) => {
      console.error(
        JSON.stringify({
          status: 'failed',
          code: error instanceof Error ? error.message : 'NOTIFICATION_RETRY_FAILED',
        }),
      );
      process.exitCode = 1;
    });
}
