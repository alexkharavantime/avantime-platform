import { isIP } from 'node:net';

export type StagingAlert = {
  event: 'staging.test.triggered' | 'staging.test.resolved';
  environmentId: string;
  correlationId: string;
  component: string;
  severity: 'warning';
  timestamp: string;
};

const FORBIDDEN = /content|text|prompt|answer|embedding|secret|credential|password|api.?key/i;

export interface StagingAlertAdapter {
  send(alert: StagingAlert): Promise<{ delivered: boolean; reference?: string }>;
}

export interface StagingEmailAlertAdapterContract {
  sendTestAlert(alert: StagingAlert): Promise<{ delivered: boolean; reference?: string }>;
}

export function createStagingTestAlert(
  environmentId: string,
  correlationId: string,
  resolved = false,
): StagingAlert {
  if (!/^staging-[a-z0-9-]+$/.test(environmentId)) {
    throw new Error('Test alert environment must be staging.');
  }
  if (!/^staging-alert-[a-z0-9-]{8,100}$/.test(correlationId)) {
    throw new Error('Test alert correlation ID is invalid.');
  }
  const alert: StagingAlert = {
    event: resolved ? 'staging.test.resolved' : 'staging.test.triggered',
    environmentId,
    correlationId,
    component: 'go-live-validation',
    severity: 'warning',
    timestamp: new Date().toISOString(),
  };
  for (const [name, value] of Object.entries(alert)) {
    if (FORBIDDEN.test(name) || FORBIDDEN.test(String(value))) {
      throw new Error('Alert payload contains forbidden data.');
    }
  }
  return alert;
}

export class NoopStagingAlertAdapter implements StagingAlertAdapter {
  async send(alert: StagingAlert): Promise<{ delivered: boolean }> {
    void alert;
    return { delivered: false };
  }
}

export class WebhookStagingAlertAdapter implements StagingAlertAdapter {
  private readonly endpoint: URL;

  constructor(endpoint: string, forbiddenProductionHosts: readonly string[]) {
    this.endpoint = new URL(endpoint);
    const hostname = this.endpoint.hostname.toLowerCase();
    if (
      this.endpoint.protocol !== 'https:' ||
      isIP(hostname) !== 0 ||
      /(^|[.-])prod(?:uction)?([.-]|$)/i.test(hostname) ||
      forbiddenProductionHosts.some(
        (forbidden) => hostname === forbidden || hostname.endsWith(`.${forbidden}`),
      )
    ) {
      throw new Error('Staging alert webhook endpoint is not allowed.');
    }
  }

  async send(alert: StagingAlert) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(alert),
      signal: AbortSignal.timeout(5_000),
    });
    return {
      delivered: response.ok,
      reference: response.headers.get('x-request-id') || undefined,
    };
  }
}
