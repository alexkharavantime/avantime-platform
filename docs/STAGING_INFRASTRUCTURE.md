# Staging infrastructure Avantime Platform

## Граница TASK-015

TASK-015 сохраняет принятую архитектуру Next.js/Turborepo, PostgreSQL/pgvector, Redis,
S3-compatible storage и Docker Compose. Kubernetes и привязка к конкретному cloud provider не
вводятся. Staging изолирован от development и production; production deployment не выполняется.

## Gap matrix

| Component          | Current state до TASK-015                           | Staging requirement                                             | External dependency                             | Required configuration                      | Missing implementation после repository baseline | Blocker                         | Acceptance check                             |
| ------------------ | --------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------- | ------------------------------------------------ | ------------------------------- | -------------------------------------------- |
| Web                | hardened standalone image                           | immutable version, `/health`, `/ready`                          | image registry, DNS/TLS                         | `APP_ENV`, URL, versions                    | managed artifact publication                     | нет registry/environment        | `/health=200`, `/ready=200`                  |
| PostgreSQL         | Prisma, pgvector, migration rehearsal               | isolated staging DB, current schema, bounded pool/transactions  | managed PostgreSQL или local pgvector           | URL, pool/timeouts, app name, migration     | provider backup/PITR evidence                    | managed DB отсутствует          | migration status и DB read                   |
| Redis              | lease queues/rate limits                            | isolated namespace, auth, bounded probes                        | managed Redis или local Redis                   | URL, namespace, TTL, timeout                | managed outage evidence                          | managed Redis отсутствует       | unique write/read/delete                     |
| Object storage     | S3 adapter и MinIO integration                      | private staging bucket, tenant prefix, cleanup probe            | S3-compatible provider/MinIO                    | endpoint, region, bucket, credentials, size | provider lifecycle/versioning evidence           | managed bucket отсутствует      | unique write/read/delete, no residue         |
| Notifications      | governance inbox и receipt validator                | durable provider outbox, terminal receipt, retry/DLQ            | Resend-compatible provider либо test adapter    | provider mode, sender, secret               | managed sender/recipient validation              | provider access отсутствует     | enqueue, concurrency, retry, terminal status |
| Knowledge indexing | PostgreSQL audience search; document pgvector       | versioned cache/search/vector adapters and durable invalidation | Redis, PostgreSQL/pgvector, embedding provider  | drivers, model/version, worker              | managed embedding/provider evidence              | managed provider отсутствует    | update, tenant deny, archive removal         |
| Workers            | document/embedding workers                          | separate notification and knowledge workers                     | DB/Redis/provider                               | IDs, leases, versions                       | external supervisor evidence                     | managed environment отсутствует | fresh heartbeat and matching generation      |
| Health             | document-specific route                             | public liveness/readiness and protected diagnostics             | all dependencies                                | full typed contract                         | external monitoring integration                  | monitoring destination absent   | safe JSON, correct HTTP status               |
| Backup/restore     | guarded encrypted DB backup and integration restore | pre-migration backup, isolated staging rehearsal, metadata      | backup storage, `pg_dump`/`pg_restore`          | destination, key, retention, versions       | managed durable-copy/PITR rehearsal              | provider absent                 | non-zero backup and restored invariants      |
| Observability      | structured operational events/contracts             | environment/service/version labels                              | OTLP/log sink                                   | service/resource identifiers                | managed dashboards/alerts                        | backend absent                  | safe structured logs and heartbeat           |
| Jira               | TASK-016 durable operation and provider adapters    | separate worker, heartbeat, backlog/DLQ and test smoke          | Jira Cloud only for approved managed validation | mode, secret ref, project, worker policy    | real Cloud provider evidence                     | credentials/environment absent  | test issue created; cloud remains pending    |

## Topology

`docker-compose.staging.yml` — единственный staging deployment manifest. Он запускает migration
job, notification worker, knowledge index worker, Jira worker, web и опциональный backup job. Services работают
non-root, read-only, без Linux capabilities, с limits, restart policy, graceful stop и immutable
version labels.

`docker-compose.staging.local.yml` — overlay той же topology для CI/developer simulation. Он
добавляет изолированные PostgreSQL/pgvector, Redis, MinIO и restore target. Buckets private;
staging prefix очищается lifecycle rule. Тестовые credentials нельзя повторно использовать вне
Compose project.

Managed staging использует базовый manifest и внешние URLs/secret-store injection. PostgreSQL,
Redis и S3 не дублируются в manifest и могут быть заменены provider-neutral совместимыми services.

## Environment contract

`.env.staging.example` содержит только placeholders. Runtime validation требует `APP_ENV=staging`,
explicit `STAGING_MODE`, staging DB/bucket/Redis namespace, strong server-only secrets, versions,
backup/observability references и явный Jira mode. Managed mode дополнительно требует TLS, cloud
Jira credentials from secret storage и реальный notification provider; local/test adapters
запрещены. Development fallback нет.

Safe summary содержит только hosts, logical resource names, drivers и versions. Access keys,
passwords, recipient addresses, provider responses и tenant content не возвращаются browser routes
и не пишутся в worker logs.

## Readiness policy

- `/health` подтверждает только жизнь процесса;
- `/ready` проверяет configuration, DB, migrations, Redis policy, object probe, provider adapter,
  worker generations, Jira mapping/heartbeat/backlog/DLQ, pgvector/index tables и governance invariants;
- local simulation может показать `GOVERNANCE_BOOTSTRAP_PENDING` как degraded; managed staging
  остаётся fail-closed без active owner;
- `/api/internal/staging-diagnostics` требует `platform.view` и добавляет redacted versions/counts;
- object/Redis probes используют unique keys и always-cleanup.

## Известные ограничения

Repository baseline не подтверждает managed DNS/TLS, secret manager, provider delivery webhook,
PITR, external observability, human accessibility и independent governance sign-off. Эти gates
остаются `PENDING`, а не simulated pass.

## Связанные документы

- [Staging deployment](./STAGING_DEPLOYMENT.md)
- [Notification outbox](./NOTIFICATION_OUTBOX.md)
- [Knowledge indexing](./KNOWLEDGE_INDEXING.md)
- [Backup and restore](./BACKUP_RESTORE.md)
- [Managed staging validation](./MANAGED_STAGING_VALIDATION.md)
- [TASK-015](./tasks/TASK-015.md)
- [TASK-016](./tasks/TASK-016.md)
- [Jira integration](./JIRA_INTEGRATION.md)
