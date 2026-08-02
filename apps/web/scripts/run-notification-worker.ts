import { runNotificationWorker } from '../lib/notification-worker-runtime';

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => controller.abort());
}

runNotificationWorker({
  once: process.argv.includes('--once'),
  signal: controller.signal,
})
  .then((summary) => {
    console.info(JSON.stringify({ event: 'notification-worker-stopped', ...summary }));
  })
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: 'notification-worker-failed',
        code: error instanceof Error ? error.message : 'NOTIFICATION_WORKER_FAILED',
      }),
    );
    process.exitCode = 1;
  });
