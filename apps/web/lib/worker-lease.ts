export type RenewableLease = {
  renew(): Promise<void>;
  assertOwned(): Promise<void>;
};

export type WorkerHeartbeatRow = {
  component: string;
  heartbeatAgeMs: number | null;
  activeJobs: bigint | number;
  staleJobs: bigint | number;
};

export function summarizeWorkerHeartbeats(rows: readonly WorkerHeartbeatRow[]) {
  return Object.fromEntries(
    rows.map((row) => {
      const heartbeatAgeMs = row.heartbeatAgeMs === null ? null : Number(row.heartbeatAgeMs);
      const activeJobs = Number(row.activeJobs);
      const staleJobs = Number(row.staleJobs);
      return [
        row.component,
        {
          status: staleJobs === 0 ? ('ready' as const) : ('unavailable' as const),
          heartbeatAgeMs,
          activeJobs,
          staleJobs,
        },
      ];
    }),
  );
}

export class WorkerLeaseHeartbeat {
  private timer: NodeJS.Timeout | null = null;
  private lostError: Error | null = null;
  private renewal: Promise<void> = Promise.resolve();

  constructor(
    private readonly lease: RenewableLease,
    private readonly intervalMs: number,
  ) {
    if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
      throw new Error('Heartbeat interval must be a positive safe integer.');
    }
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.renewal = this.renewal.then(async () => {
        if (this.lostError) return;
        try {
          await this.lease.renew();
        } catch {
          this.lostError = new Error('Worker lease was lost during heartbeat renewal.');
        }
      });
    }, this.intervalMs);
    this.timer.unref();
  }

  async assertOwned() {
    await this.renewal;
    if (this.lostError) throw this.lostError;
    await this.lease.assertOwned();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.renewal;
  }
}
