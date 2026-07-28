export type AiOperationalEventName =
  | 'embedding_job_queued'
  | 'embedding_job_completed'
  | 'embedding_job_failed'
  | 'chunks_embedded'
  | 'provider_call'
  | 'retrieval_query'
  | 'rag_request';

export type AiOperationalEvent = {
  name: AiOperationalEventName;
  occurredAt: string;
  companyId: string;
  correlationId: string;
  outcome: 'success' | 'failure' | 'no_answer';
  durationMs?: number;
  count?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostEur?: number;
  errorCode?: string;
};

export interface AiOperationalEventSink {
  record(event: AiOperationalEvent): void;
}

export class InMemoryAiOperationalEventSink implements AiOperationalEventSink {
  private readonly events: AiOperationalEvent[] = [];

  record(event: AiOperationalEvent) {
    this.events.push({ ...event });
  }

  list() {
    return this.events.map((event) => ({ ...event }));
  }

  summary() {
    return this.events.reduce(
      (summary, event) => {
        summary.events += 1;
        summary.estimatedCostEur += event.estimatedCostEur ?? 0;
        if (event.outcome === 'failure') summary.failures += 1;
        if (event.outcome === 'no_answer') summary.noAnswers += 1;
        if (event.name === 'chunks_embedded') summary.chunksEmbedded += event.count ?? 0;
        if (event.name === 'retrieval_query') summary.retrievalQueries += 1;
        if (event.name === 'rag_request') summary.ragRequests += 1;
        return summary;
      },
      {
        events: 0,
        failures: 0,
        chunksEmbedded: 0,
        retrievalQueries: 0,
        ragRequests: 0,
        noAnswers: 0,
        estimatedCostEur: 0,
      },
    );
  }
}

export class NoopAiOperationalEventSink implements AiOperationalEventSink {
  record(): void {}
}
