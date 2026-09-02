# Production Architecture

## Назначение

Документ фиксирует provider-neutral topology для безопасной эксплуатации
всего runtime Avantime Platform после TASK-018. Это reference architecture, а не
подтверждение конкретной production-среды.

## Topology

```mermaid
flowchart LR
  U[Users] --> LB[Reverse proxy / load balancer]
  LB --> W1[Stateless web]
  LB --> W2[Stateless web]
  W1 --> PG[(PostgreSQL + pgvector)]
  W2 --> PG
  W1 --> S3[(Private S3-compatible storage)]
  W2 --> S3
  W1 --> R[(Redis coordination)]
  W2 --> R
  DW[Document workers + OCR runtime] --> R
  EW[Embedding workers] --> R
  KW[Knowledge index workers] --> R
  NW[Notification workers] --> PG
  JO[Jira outbound workers] --> PG
  JI[Jira inbound workers] --> PG
  DW --> PG
  EW --> PG
  KW --> PG
  DW --> S3
  EW --> AI[AI Gateway / providers]
  KW --> AI
  NW --> NP[Notification provider]
  JO --> JIRA[Jira provider]
  JI --> JIRA
  W1 --> AI
  MON[Monitoring / traces / alerts] -.-> W1
  MON -.-> DW
  MON -.-> EW
  MON -.-> KW
  MON -.-> NW
  MON -.-> JO
  MON -.-> JI
  BK[Encrypted backup storage] --- PG
  BK --- S3
```

## Responsibilities

| Component              | Responsibility                                   | Public access    |
| ---------------------- | ------------------------------------------------ | ---------------- |
| Reverse proxy          | TLS termination, request limits, rolling routing | HTTPS only       |
| Web                    | Authenticated API/UI, readiness, orchestration   | Through proxy    |
| Document worker        | Checksum, extraction, OCR, chunks                | No               |
| Embedding worker       | Versioned embeddings and vector lifecycle        | No               |
| Knowledge index worker | Article index lifecycle and invalidation         | No               |
| Notification worker    | Durable notification outbox delivery             | No               |
| Jira outbound worker   | Durable issue/comment synchronization            | No               |
| Jira inbound worker    | Durable webhook/status/comment projection        | No               |
| Migration job          | One-shot additive Prisma migration chain         | No               |
| Backup/operations      | Guarded backup, restore and operational checks   | No               |
| PostgreSQL/pgvector    | Metadata, vectors, jobs, budgets, ledger, audit  | No               |
| S3-compatible storage  | Private originals and derivatives                | No               |
| Redis                  | Queue leases/fencing and distributed limits      | No               |
| AI providers           | Embeddings/answers through AI Gateway only       | Egress allowlist |
| Monitoring             | Logs, metrics, traces and alerts                 | Restricted       |
| Backup storage         | Encrypted isolated copies                        | Restricted       |

## Scaling and isolation

- Web nodes do not store runtime state locally.
- Workers scale independently and use server-time leases with fencing.
- Every job, metadata operation, vector query, ledger entry and audit event is
  tenant-scoped. Tenant comes from server-side identity/configuration.
- Redis keys contain internal hashes/identifiers; queue payload excludes file,
  text, prompt, answer, embedding and credentials.
- Database, Redis, object storage, workers and monitoring reside on private
  networks. Only reverse proxy is externally reachable.

## Deployment sequence

1. Validate secrets/configuration and backup freshness.
2. Run additive migrations once in a dedicated migration job.
3. Deploy document, embedding, knowledge, notification and both Jira worker generations.
4. Observe matching runtime heartbeat and queue/lease age, then deploy web nodes.
5. Drain old generation; stale writes are rejected by fencing.
6. Run health, retrieval and backup smoke checks.

Rollback stops the new generation, restores compatible application images and
leaves additive schema in place. Destructive schema rollback is not automatic.

## Availability boundaries

Core document readiness, OCR, embedding/vector and RAG remain separate components. Staging `/ready`
also requires fresh document/embedding runtime heartbeat, no stale active jobs, and the existing
notification, knowledge and Jira worker heartbeat contracts.
Production requires configured OCR and RAG boundaries. Queue, worker, budget,
backup and restore state are exposed through restricted operational commands and
metrics without secrets.

## Рекомендации по улучшению

- Validate topology in a staging environment matching expected tenant/document load.
- Add multi-zone placement only after managed-service failure modes are tested.
- Confirm owners, capacity and SLO evidence before go-live approval.

## Связанные документы

- [Architecture 2.0](./ARCHITECTURE_2_0.md)
- [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
- [Queue Operations](./QUEUE_OPERATIONS.md)
- [Observability](./OBSERVABILITY.md)
- [Backup and Restore](./BACKUP_RESTORE.md)
- [TASK-005](./tasks/TASK-005.md)
