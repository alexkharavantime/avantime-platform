import type { DocumentProcessingWorker } from './document-processing-worker';

export class DocumentWorkerShutdown {
  private requested = false;
  private readonly waiters = new Set<() => void>();

  get isRequested() {
    return this.requested;
  }

  request() {
    if (this.requested) return;
    this.requested = true;
    for (const resolve of this.waiters) resolve();
    this.waiters.clear();
  }

  async wait(milliseconds: number) {
    if (this.requested) return;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.waiters.delete(stopWaiting);
        resolve();
      }, milliseconds);
      const stopWaiting = () => {
        clearTimeout(timeout);
        this.waiters.delete(stopWaiting);
        resolve();
      };
      this.waiters.add(stopWaiting);
    });
  }
}

export async function runDocumentWorkerLoop(options: {
  worker: DocumentProcessingWorker;
  tenant: {
    companyId: string;
    userId: string;
  };
  workerId: string;
  pollIntervalMs: number;
  shutdown: DocumentWorkerShutdown;
  onResult?: (
    result: Awaited<ReturnType<DocumentProcessingWorker['runOnce']>>,
  ) => void | Promise<void>;
}) {
  while (!options.shutdown.isRequested) {
    const result = await options.worker.runOnce(options.tenant, options.workerId);
    await options.onResult?.(result);
    if (result.outcome === 'IDLE') {
      await options.shutdown.wait(options.pollIntervalMs);
    }
  }
}
