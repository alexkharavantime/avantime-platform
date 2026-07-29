# TASK-005. Production Readiness, Reliability and Operations

## Статус

Completed

## Ветка

`feature/task-005-production-readiness`

## Цель

Подготовить document processing, OCR, embeddings и Hybrid RAG к безопасной
production-эксплуатации, сохранив tenant isolation, `ADMIN`-only модель,
production fail-fast и существующие API TASK-002–TASK-004.

## Scope

- provider-neutral production deployment architecture;
- Redis-backed document/embedding queues;
- heartbeat, lease renewal, fencing и crash recovery workers;
- distributed AI rate limits;
- persistent AI usage/cost ledger и budget enforcement в EUR;
- PostgreSQL и object-storage backup, isolated restore rehearsal и DR runbooks;
- structured logs, metrics, traces, audit и alertable operational state;
- controlled pgvector load test и измеримое решение по ANN;
- page provenance для PDF/OCR chunks и citations;
- production configuration/provider validation и container hardening;
- migration, integration environment, CI/CD gates и go-live checklist.

## Не входит

- CRM, Jira, public AI chat, AI Agents и общий redesign;
- объединение `/portal` и `/dashboard`;
- расширение RBAC или client-facing document/RAG access;
- платные provider calls и production credentials;
- выбор конкретного cloud provider;
- destructive production restore и автоматический ANN rollout.

## Архитектурный результат

- Web nodes остаются stateless; document и embedding workers запускаются
  отдельными горизонтально масштабируемыми процессами.
- PostgreSQL/pgvector остаётся system of record, S3-compatible storage — private
  object boundary, Redis — coordination/queue/rate-limit boundary.
- Development/tests сохраняют local/memory adapters. Production запрещает
  local queue, memory rate limiter, fake provider и local filesystem.
- Queue payload содержит только безопасные tenant/job identifiers, version и
  correlation ID, но не document content.
- Worker получает server-time lease и возрастающий fencing token. Heartbeat
  продлевает lease; critical updates и completion отклоняются после его потери.
- AI provider call разрешён только после distributed rate-limit check и
  race-safe budget reservation. Usage ledger и audit trail append-only по
  application contract и не содержат prompts, answers или document text.

## Критерии приёмки

- [x] Добавлены Redis adapters для document и embedding queue.
- [x] Реализованы idempotency, delayed retry, lease recovery, heartbeat и fencing.
- [x] Production configuration запрещает local/memory/fake adapters и требует TLS.
- [x] Добавлены Redis distributed limits и PostgreSQL AI cost/budget ledger.
- [x] Budget reservation выполняется до provider call, reconciliation — после.
- [x] Добавлены guarded backup/restore и isolated restore rehearsal.
- [x] Добавлены production observability и persistent audit contracts.
- [x] Page provenance проходит через PDF/OCR chunks, vectors и citations.
- [x] Controlled exact/IVFFlat/HNSW pgvector test выполнен без включения ANN.
- [x] Добавлена additive migration без destructive operations.
- [x] Integration environment расширен Redis и отдельной restore database.
- [x] Добавлены production Docker targets, reference Compose и CI gates.
- [x] Добавлены operational commands и runbooks.
- [x] Полностью классифицированы актуальные npm advisories.
- [x] Завершён весь финальный gate suite без ошибок.

## Фактически подтверждено

На 2026-07-29 после восстановления и полного повторного прогона подтверждены:

- unit/security suite: 103/103;
- PostgreSQL/MinIO/local queue/pgvector/RAG/Redis production integration:
  18/18;
- отдельные Redis queue/fencing/rate-limit/cost-ledger/audit и Hybrid RAG suites:
  1/1 и 1/1;
- real OCR integration через Tesseract/Poppler: 1/1;
- isolated PostgreSQL restore rehearsal: 5 migrations, 9 прикладных tables;
- empty/legacy/repeated migration rehearsal: 5/5 migrations;
- pgvector smoke и controlled comparison exact/IVFFlat/HNSW;
- document/core, worker, embedding/vector и RAG health checks: `ready`;
- Redis queue health: `ready`, обе очереди пусты после cleanup;
- Prisma generation/schema validation, TypeScript typecheck, ESLint, secret scan,
  destructive migration scan, scoped Prettier и `git diff --check`;
- production build: 59 static entries; все пять production Docker targets
  повторно собраны локально без публикации, non-root metadata и Tesseract/pg_dump
  runtime проверены.

После восстановления дополнительно исправлены три найденные regression:

- PostgreSQL embedding queue claim больше не использует application clock и
  сохраняет server-time lease contract;
- каждый embedding batch получает отдельный budget idempotency key;
- stale active heartbeat нельзя скрыть свежим heartbeat другого worker.

Authoritative review через официальный npm audit endpoint классифицировал все
12 high records общего дерева и три high records pruned worker runtime. Raw JSON,
dependency paths, image inventory, reachability, available fixes и решения
сохранены в [Dependency Security Review](../DEPENDENCY_SECURITY_REVIEW.md).

Совместимое обновление устранило affected nested path
`minimatch 10.2.5 -> 10.2.6 -> brace-expansion 5.0.8`. Оставшиеся lint-chain
records приняты как development/build-only risk `AR-DEP-2026-001`, а pinned
Next/PostCSS/Sharp records — как недостижимый в текущих supported runtime flows
risk `AR-DEP-2026-002`. Оба решения истекают `2026-08-12` и автоматически
открываются повторно при изменении reachability assumptions.

После lockfile update повторно прошли 103/103 unit tests, typecheck, lint,
production build на 59 entries, 18/18 full integration, production integration,
Hybrid RAG integration, real OCR Docker integration, secret scan и все пять
production Docker targets.

## Известные ограничения и риски

- production SLO являются начальными целями, а не подтверждёнными измерениями;
- ANN не включён: на повторном controlled test из 50 000 vectors IVFFlat дал
  recall `0.1256`, HNSW — `0.6484`, exact — `1.0`; ни одна ANN strategy не
  прошла quality threshold;
- real provider connectivity требует staging secrets и отдельного разрешения;
- Redis не является system of record: потерянные queue jobs восстанавливаются
  reconciliation по PostgreSQL metadata;
- object-storage PITR зависит от versioning/replication конкретного провайдера;
- accepted dependency risks `AR-DEP-2026-001/002` требуют review не позднее
  `2026-08-12`; runtime CSS processing, Next image optimization, direct Sharp,
  untrusted glob patterns или public image inputs немедленно отменяют acceptance;
- package installation продолжает явно показывать 12 high records overall и три
  high в pruned worker runtime; они не скрыты и полностью классифицированы;
- reference Compose сохраняет encrypted database archive в persistent staging
  volume; перенос с проверкой checksum в isolated immutable storage остаётся
  обязанностью конкретного deployment.

## Результат выполнения

TASK-005 завершена в заявленной application/code/documentation границе.
Authoritative dependency review выполнен, все findings классифицированы, два
ограниченных риска явно приняты с compensating controls и сроком review, а
финальный gate suite повторно подтверждён.

Статус `Completed` не означает готовность всей Version 2.0 или production
go-live: остаются production identity/RBAC, реальные managed staging/provider
checks, SBOM/OS image scan и утверждение инфраструктурных owners.

## Рекомендации для TASK-006

- production identity, MFA/SSO и полная tenant permission model;
- staging rollout с реальными managed PostgreSQL/S3/Redis и secret manager;
- human-labeled RAG evaluation и подтверждение SLO на production-like нагрузке;
- article indexing и единый Knowledge Center permission boundary;
- provider fallback/circuit breaker и cost calibration по фактическим invoices.

## Связанные документы

- [Vision](../VISION.md)
- [Master Specification](../MASTER_SPECIFICATION.md)
- [Architecture 2.0](../ARCHITECTURE_2_0.md)
- [Architecture Decisions](../DECISIONS.md)
- [Production Architecture](../PRODUCTION_ARCHITECTURE.md)
- [Production Deployment](../PRODUCTION_DEPLOYMENT.md)
- [Queue Operations](../QUEUE_OPERATIONS.md)
- [AI Cost Control](../AI_COST_CONTROL.md)
- [Backup and Restore](../BACKUP_RESTORE.md)
- [Disaster Recovery](../DISASTER_RECOVERY.md)
- [Observability](../OBSERVABILITY.md)
- [Security Hardening](../SECURITY_HARDENING.md)
- [Dependency Security Review](../DEPENDENCY_SECURITY_REVIEW.md)
- [Production Readiness Checklist](../PRODUCTION_READINESS_CHECKLIST.md)
- [TASK-004](./TASK-004.md)
