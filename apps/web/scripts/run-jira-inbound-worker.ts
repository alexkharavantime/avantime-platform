import { runJiraInboundWorker } from '../lib/jira-inbound-worker-runtime';

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => controller.abort());
}

runJiraInboundWorker({
  once: process.argv.includes('--once'),
  signal: controller.signal,
}).catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'jira-inbound-worker-stopped',
      errorCode: error instanceof Error ? error.message : 'JIRA_INBOUND_WORKER_FAILED',
    }),
  );
  process.exitCode = 1;
});
