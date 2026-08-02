# TASK-015 — Staging infrastructure baseline

**Статус:** Done (repository/local staging scope; managed staging validation pending)  
**Ветка:** `feature/task-015-staging-baseline`

## Цель

Подготовить минимальный воспроизводимый staging-контур для проверки пользовательских сценариев и
следующей TASK-016 (Jira ticket creation), не создавая production deployment или новую governance
subsystem.

## Реализованный объём

- provider-neutral Docker Compose topology с local PostgreSQL/pgvector, Redis и MinIO overlay;
- typed fail-fast staging environment contract и redacted diagnostics;
- migration/current-schema gate, `/health`, `/ready`, worker heartbeat and version correlation;
- durable notification outbox с transactional governance trigger, lease/concurrency fencing,
  terminal provider receipt, retry/DLQ/manual retry and test/Resend adapters;
- separate durable knowledge invalidation pipeline with Redis version cache, PostgreSQL search,
  pgvector, ownership/visibility/version fencing and archive removal;
- encrypted backup metadata and isolated local staging restore rehearsal;
- staging smoke/security/CI gates, deployment and rollback runbooks;
- Jira remains disabled and contains no credentials.

## Критерии приёмки

- [x] staging/development/production configuration separated; placeholders/defaults rejected;
- [x] no credentials committed; `.env.staging.example` is placeholders only;
- [x] migration, Redis, S3 and version readiness contracts implemented;
- [x] notification claims cannot double-send at application lease boundary;
- [x] retries, terminal delivery and DLQ are bounded and visible;
- [x] stale/foreign/private/archive knowledge is fenced at index/read boundaries;
- [x] local/managed deployment use one Compose approach;
- [x] backup/restore and deploy/rollback procedures are explicit and non-destructive;
- [x] final full unit/integration/build/browser/security/local Compose validation recorded;
- [ ] managed staging deployment/provider evidence — `PENDING`, environment/access absent;
- [ ] production deployment — intentionally not performed.

## Результат выполнения

Repository/local implementation validated on 2026-08-02:

- `npm run db:generate`, forced typecheck and lint passed for all workspaces;
- full unit suite: 174/174; full integration suite: 26/26; RAG and production integration: 1/1 each;
- empty/legacy/repeated migration rehearsal passed with 13 migrations;
- local staging Compose reached healthy for PostgreSQL, Redis, MinIO, both workers and web;
- smoke passed 11 checks across HTTP, DB, Redis, object storage, outbox and knowledge fencing;
- encrypted backup completed; isolated restore found 13 migrations, 41 tables and both TASK-015 tables;
- targeted Chromium browser smoke passed desktop/tablet/mobile: 3/3;
- static secret/migration/identity/credential/default/tenant/permission/governance/staging scans and
  documentation link checks passed;
- production Docker build completed with 103 application routes.

The live `npm audit` registry request was not executed because external dependency metadata
transmission was not approved in this environment. Managed staging must not be marked complete from
local simulation.

## Известные ограничения

- managed secret store, DNS/TLS, notification sender/recipient, external observability and PITR are
  not available in this workspace;
- terminal Resend behavior requires provider validation;
- local deterministic embeddings validate fencing/storage, not semantic quality;
- automatic database rollback is intentionally absent;
- TASK-006 and Draft PR #11 were not modified.

## Связанные документы

- [Staging infrastructure](../STAGING_INFRASTRUCTURE.md)
- [Staging deployment](../STAGING_DEPLOYMENT.md)
- [Notification outbox](../NOTIFICATION_OUTBOX.md)
- [Knowledge indexing](../KNOWLEDGE_INDEXING.md)
- [Backup and restore](../BACKUP_RESTORE.md)
- [TASK-014](./TASK-014.md)
