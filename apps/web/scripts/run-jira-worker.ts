import { runJiraWorker } from '../lib/jira-worker-runtime';

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => controller.abort());
}

runJiraWorker({
  once: process.argv.includes('--once'),
  signal: controller.signal,
})
  .then((summary) => {
    console.info(JSON.stringify({ event: 'jira-worker-stopped', ...summary }));
  })
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: 'jira-worker-failed',
        code: error instanceof Error ? error.message : 'JIRA_WORKER_FAILED',
      }),
    );
    process.exitCode = 1;
  });
