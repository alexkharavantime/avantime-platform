import { createHmac } from 'node:crypto';

export type ProductionMetricName =
  | 'document.queue.depth'
  | 'embedding.queue.depth'
  | 'job.age.ms'
  | 'job.retry.count'
  | 'job.quarantine.count'
  | 'worker.heartbeat.age.ms'
  | 'ocr.latency.ms'
  | 'embedding.latency.ms'
  | 'provider.latency.ms'
  | 'retrieval.latency.ms'
  | 'rag.latency.ms'
  | 'vector.query.latency.ms'
  | 'ai.cost.eur'
  | 'ai.budget.utilization'
  | 'rag.no_answer.count'
  | 'rag.citation.count'
  | 'security.tenant_leakage.count'
  | 'backup.age.ms'
  | 'restore.rehearsal.status';

export type SafeTelemetryAttributes = {
  correlationId?: string;
  tenantRef?: string;
  component?: string;
  provider?: string;
  model?: string;
  outcome?: string;
  errorCode?: string;
  workerVersion?: string;
  deploymentGeneration?: string;
};

export interface ProductionTelemetry {
  log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    attributes?: SafeTelemetryAttributes,
  ): void;
  metric(name: ProductionMetricName, value: number, attributes?: SafeTelemetryAttributes): void;
  trace<T>(name: string, attributes: SafeTelemetryAttributes, action: () => Promise<T>): Promise<T>;
}

const FORBIDDEN_ATTRIBUTE =
  /content|text|prompt|answer|embedding|credential|password|secret|apiKey/i;

function validateTelemetry(attributes: SafeTelemetryAttributes) {
  for (const [name, value] of Object.entries(attributes)) {
    if (FORBIDDEN_ATTRIBUTE.test(name)) {
      throw new Error('Telemetry attribute name is forbidden.');
    }
    if (value !== undefined && value.length > 250) {
      throw new Error('Telemetry attribute value is too long.');
    }
  }
}

export function createTenantReference(companyId: string, integrityKey: string) {
  if (integrityKey.length < 32) throw new Error('Telemetry integrity key is too short.');
  return createHmac('sha256', integrityKey).update(companyId).digest('hex').slice(0, 24);
}

export class NoopProductionTelemetry implements ProductionTelemetry {
  log(): void {}
  metric(): void {}
  trace<T>(_name: string, _attributes: SafeTelemetryAttributes, action: () => Promise<T>) {
    return action();
  }
}

export class ConsoleProductionTelemetry implements ProductionTelemetry {
  log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    attributes: SafeTelemetryAttributes = {},
  ) {
    validateTelemetry(attributes);
    const record = JSON.stringify({
      timestamp: new Date().toISOString(),
      severity: level,
      message,
      ...attributes,
    });
    if (level === 'error') console.error(record);
    else if (level === 'warn') console.warn(record);
    else console.info(record);
  }

  metric(name: ProductionMetricName, value: number, attributes: SafeTelemetryAttributes = {}) {
    validateTelemetry(attributes);
    if (!Number.isFinite(value)) throw new Error('Metric value must be finite.');
    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        signal: 'metric',
        name,
        value,
        ...attributes,
      }),
    );
  }

  async trace<T>(name: string, attributes: SafeTelemetryAttributes, action: () => Promise<T>) {
    validateTelemetry(attributes);
    const startedAt = performance.now();
    try {
      const result = await action();
      this.log('info', 'trace.completed', {
        ...attributes,
        component: name,
        outcome: 'success',
      });
      return result;
    } catch (error) {
      this.log('error', 'trace.failed', {
        ...attributes,
        component: name,
        outcome: 'failure',
        errorCode: error instanceof Error ? error.name : 'UNKNOWN',
      });
      throw error;
    } finally {
      const durationMs = performance.now() - startedAt;
      if (Number.isFinite(durationMs)) {
        console.info(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            signal: 'trace',
            name,
            durationMs,
            ...attributes,
          }),
        );
      }
    }
  }
}

export class OpenTelemetryCompatibleAdapter implements ProductionTelemetry {
  constructor(
    private readonly exporter: {
      emitLog(record: Record<string, unknown>): void;
      emitMetric(record: Record<string, unknown>): void;
      startSpan(
        name: string,
        attributes: Record<string, string>,
      ): { end(errorCode?: string): void };
    },
  ) {}

  log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    attributes: SafeTelemetryAttributes = {},
  ) {
    validateTelemetry(attributes);
    this.exporter.emitLog({ level, message, attributes });
  }

  metric(name: ProductionMetricName, value: number, attributes: SafeTelemetryAttributes = {}) {
    validateTelemetry(attributes);
    this.exporter.emitMetric({ name, value, attributes });
  }

  async trace<T>(name: string, attributes: SafeTelemetryAttributes, action: () => Promise<T>) {
    validateTelemetry(attributes);
    const span = this.exporter.startSpan(
      name,
      Object.fromEntries(
        Object.entries(attributes).filter((entry): entry is [string, string] => Boolean(entry[1])),
      ),
    );
    try {
      const result = await action();
      span.end();
      return result;
    } catch (error) {
      span.end(error instanceof Error ? error.name : 'UNKNOWN');
      throw error;
    }
  }
}
