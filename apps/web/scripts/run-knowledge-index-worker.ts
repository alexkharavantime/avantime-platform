import { runKnowledgeIndexWorker } from '../lib/knowledge-index-worker';

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => controller.abort());
}

runKnowledgeIndexWorker({
  once: process.argv.includes('--once'),
  signal: controller.signal,
})
  .then((summary) => {
    console.info(JSON.stringify({ event: 'knowledge-index-worker-stopped', ...summary }));
  })
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: 'knowledge-index-worker-failed',
        code: error instanceof Error ? error.message : 'KNOWLEDGE_INDEX_WORKER_FAILED',
      }),
    );
    process.exitCode = 1;
  });
