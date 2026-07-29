# Production Observability

## Contracts

`ProductionTelemetry` separates structured logs, metrics and spans. Available
adapters are no-op, safe console and OpenTelemetry-compatible callbacks.
`ProductionAuditTrail` is a separate append-only security/business record.

All telemetry carries correlation ID. Tenant is represented by an HMAC-derived
internal reference. Attribute validation rejects content, text, prompts, answers,
embeddings, credentials, passwords, secrets and API keys.

## Required metrics

| Area       | Metrics                                                      |
| ---------- | ------------------------------------------------------------ |
| Queues     | depth, oldest job age, retries, quarantine                   |
| Workers    | heartbeat age, lease loss/fence rejection                    |
| Processing | OCR and embedding latency/error rate                         |
| Retrieval  | retrieval/RAG/vector latency, no-answer rate, citation count |
| Security   | tenant leakage count, rejected unsafe telemetry              |
| AI cost    | EUR cost, reservation failures, budget utilization           |
| Recovery   | backup age, restore rehearsal status                         |

## Initial alert thresholds

These are proposed, not measured SLO commitments:

- API availability below 99.9% over 30 days;
- document queue age over 5 minutes warning / 15 minutes critical;
- worker heartbeat older than two lease intervals;
- OCR success below 98% over 30 minutes;
- embedding completion p95 above 10 minutes;
- retrieval p95 above 500 ms; RAG p95 above 10 seconds;
- citation validity below 99.5%;
- tenant leakage count greater than zero: immediate critical incident;
- database backup age over 24 hours or restore rehearsal older than 90 days;
- budget utilization above 80% warning, hard threshold critical.

## Health access

Public liveness/readiness remains sanitized. Core, OCR, embedding/vector and RAG
components are explicit. Detailed health is `ADMIN`-only; queue, heartbeat,
backup and budget details are available through restricted operational commands.
No response exposes URLs, bucket/database names, credentials or provider errors.

## Audit events

Persistent events cover document upload/delete/reprocess, reindex, quarantine
retry, sensitive configuration validation, budget override, backup, restore
rehearsal and administrative RAG where policy requires. Metadata is safe,
content-free and append-only at the application boundary.

## Рекомендации по улучшению

- Bind the OpenTelemetry-compatible adapter to the selected collector in staging.
- Define dashboards and paging routes with named owners.
- Recalibrate thresholds from production-like load before SLO approval.

## Связанные документы

- [Production Architecture](./PRODUCTION_ARCHITECTURE.md)
- [Queue Operations](./QUEUE_OPERATIONS.md)
- [AI Cost Control](./AI_COST_CONTROL.md)
- [Disaster Recovery](./DISASTER_RECOVERY.md)
- [TASK-005](./tasks/TASK-005.md)
