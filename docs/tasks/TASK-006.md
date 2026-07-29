# TASK-006. Staging Deployment and Go-Live Validation

## Статус

In Progress

## Ветка

`feature/task-006-staging-go-live`

## Цель

Подготовить воспроизводимый production-like staging deployment и
environment-specific go-live validation без production data, production secrets,
публикации images и реального production запуска.

## Scope

- provider-neutral Docker Compose staging topology;
- staging configuration и environment isolation guards;
- environment/file/external managed secrets contracts;
- DNS/TLS и AI provider validation;
- synthetic EN/LV/RU document/OCR/RAG dataset;
- migration, smoke, load, backup/restore и evidence automation;
- OpenTelemetry-compatible local collector и controlled alert contract;
- SBOM и container vulnerability scanning;
- owner approval и formal go-live decision model;
- CI/CD gates и operational documentation.

## Не входит

- CRM, Jira, public AI chat или redesign;
- общий RBAC и объединение `/portal` с `/dashboard`;
- production data, production infrastructure или production запуск;
- платные provider calls без отдельного разрешения;
- destructive migration/restore, image publishing и фиктивные approvals.

## Current-state audit

- До TASK-006 существовал только
  `docker-compose.production.example.yml`; это reference template, не staging
  manifest и не environment evidence.
- Local integration Compose предоставляет PostgreSQL/pgvector, MinIO и Redis.
  Document worker, embedding worker, OCR и RAG проверяются отдельными runners.
- Production config/readiness, queue/heartbeat, budget, backup и restore commands
  уже реализованы TASK-005.
- Пять migrations TASK-001–TASK-005 применяются последовательно и повторяемо.
- После повторного старта остановленного Docker environment подтверждены 18/18
  integration tests, production integration, Hybrid RAG и real OCR.
- Внешние staging infrastructure, DNS/certificate, provider credentials,
  monitoring destination, immutable backup target и named owners недоступны.
- `AR-DEP-2026-001/002` действуют до `2026-08-12`; автоматическое продление
  запрещено. Повторный audit/image review входит в финальные gates.

## Архитектурный результат

- Основной deployment path — production-like Docker Compose staging по
  ADR-0025.
- Единственные публичные ports — HTTP/HTTPS reverse proxy. PostgreSQL, Redis,
  object storage, workers, collector и Prometheus находятся на internal networks.
- Migration является отдельным one-shot job и блокирует web/workers до успеха.
- Web и workers получают secrets через allowlisted file-to-environment
  entrypoint либо через environment/external provider contract.
- Configuration запрещает production hostnames, placeholder values, один tenant,
  local queues/memory controls и неявный fake provider.
- Go-live status вычисляется из evidence gates и approvals; blocking pending или
  failed gate даёт `BLOCKED`.

## Checklist

- [x] Добавлен staging configuration schema и `.env.staging.example`.
- [x] Добавлены environment/file/external secrets contracts и startup entrypoint.
- [x] Добавлен production-like staging Compose с migration, probes, limits,
      volumes, private networks, reverse proxy, backup и monitoring.
- [x] Добавлены TLS, provider, alert, evidence, approval и go-live contracts.
- [x] Добавлен synthetic dataset manifest/generator.
- [x] Добавлены staging plan/deploy/migrate/smoke/load/backup/restore commands.
- [x] Добавлены SBOM/image scan commands без image publishing/remediation.
- [x] Добавлены обязательные security regression tests.
- [x] Выполнен authoritative dependency re-review для TASK-006: 12 high,
      0 critical, решения TASK-005 не продлены.
- [x] Собраны все local release images, checksum SBOM manifest и полные Grype
      reports для совпадающих новых image IDs.
- [x] Production entrypoints скомпилированы в builder; `tsx`, `esbuild`,
      TypeScript, npm/npx и source maps отсутствуют в финальных runtime images.
- [x] Выполнено контролируемое Alpine/Debian slim сравнение реального OCR
      PDF/PNG/JPEG workload; Alpine сохранён как меньший и менее уязвимый вариант.
- [ ] Развёрнута внешняя managed staging environment.
- [ ] Подтверждены DNS/TLS и network isolation снаружи.
- [ ] Подтверждены реальные provider model/dimension checks.
- [ ] Подтверждены monitoring ingestion и alert delivery/acknowledgement.
- [ ] Выполнены production-like staging backup/isolated restore и rollback drill.
- [ ] Получены все owner approvals.
- [ ] Все blocking gates имеют immutable environment evidence.

## Критерии завершения

TASK-006 может стать `Completed` только если нет failed/pending blocking gates,
нет critical или непринятого high runtime риска, все approvals получены и
evidence package ссылается на фактическую staging environment. Локальные и CI
проверки не заменяют эти условия.

## Результат выполнения

Реализация продолжается. Все ранее заблокированные локальные gates выполнены
заново, production images пересобраны и post-remediation image reports
классифицированы. Итоговый go-live status остаётся `BLOCKED`: есть непринятый
production runtime image risk, а внешняя staging environment и обязательные
owner/security evidence отсутствуют.

### Повторная проверка 2026-07-29

- `npm run test:integration`: 18/18 passed; PostgreSQL/pgvector, MinIO, Redis и
  пять migrations подтверждены.
- `npm run test:production-integration`: 1/1 passed.
- `npm run test:rag-integration`: 1/1 passed.
- `npm run test:ocr-integration:docker`: 1/1 passed для реальных PDF/PNG/JPEG;
  финальный Alpine OCR image `f69a778ec737…`.
- Migration rehearsal: empty и legacy databases, повторный deploy и все пять
  migrations — passed.
- Staging smoke: 4/4 local synthetic checks passed. Внешние TLS/login/provider/
  alert проверки остаются отдельными managed-environment gates.
- Staging bounded load smoke: recall `1.0`, sequential scans `0`, timeouts `0`,
  p50 `2.46 ms`, p95/p99 `2.575 ms`, `896.15 QPS`; это local smoke, не
  production capacity evidence.
- Encrypted backup dry-run и isolated restore rehearsal passed; restore
  подтвердил пять migrations и девять tables, не изменяя source database.
- authoritative npm audit: 12 high, 0 critical; полный безопасный локальный
  отчёт и checksum зафиксированы.
- Все targets пересобраны no-cache с `--pull` на
  `node:22.22.2-alpine3.23`: web `a05a1671e81f…`, document-worker
  `6ba7595ff3ed…`, embedding-worker `90b5dfacfeec…`, migration
  `dae5b4f38a5b…`, operations `37c57d7cb5f4…`, OCR test
  `f69a778ec737…`.
- Runtime inspection подтвердил non-root, прямой Node startup, отсутствие
  `tsx`/`esbuild`/TypeScript/global npm/source maps, OCR только в
  document-worker/test image и рабочий Prisma `6.19.3` migration CLI.
- CycloneDX повторно сгенерирован pinned Syft `1.50.0` для всех новых IDs;
  manifest checksums и scan IDs совпадают.
- Grype post-remediation scan выполнен только для новых IDs. Counts уменьшились
  с `82/144/144/127/144/115` до `3/11/0/0/0/11`; полный разбор находится в
  [SBOM and Image Scanning](../SBOM_AND_IMAGE_SCANNING.md).
- Старые Node/OpenSSL/global npm и все esbuild/embedded-Go findings исправлены.
  Web PostCSS/Sharp покрыты действующим `AR-DEP-2026-002`. Остались 11
  непринятых native OCR matches в production document-worker: GLib 1 critical +
  6 high, SQLite 2 high и TIFF 2 high.
- Контролируемое сравнение одинакового OCR workload: Alpine — 268,025,436 bytes
  и 11 critical/high; Debian Trixie slim — 388,486,881 bytes и 75
  critical/high. Оба варианта прошли PDF/PNG/JPEG, поэтому Debian отклонён.
- DNS/TLS, real provider, alert delivery, managed backup/restore, rollback drill
  и approvals не запускались из-за отсутствия внешней environment/credentials и
  отдельного разрешения на provider cost.

## Известные ограничения и риски

- `.env.staging.example` намеренно содержит placeholders и не deployable.
- Local Compose validation не подтверждает managed service TLS, PITR, firewall,
  DNS, certificate chain, alert routing или provider capacity.
- Fake provider допустим только как явный staging override и не закрывает real
  provider gate.
- Локальный pinned Syft сформировал checksum CycloneDX manifest; внешний CI/CD
  execution и immutable artifact retention всё ещё требуют отдельного evidence.
- Image security gate остаётся `Blocked`: GLib/SQLite/TIFF в production OCR
  stack не имеют Alpine fix и не получили Security Owner acceptance. TIFF input
  запрещён, а SQLite/уязвимые GLib APIs не используются приложением, но native
  библиотеки входят в исполняемый Tesseract/Poppler package graph, поэтому риск
  не скрыт и не принят автоматически.
- Accepted dependency risks истекают `2026-08-12`.

## Связанные документы

- [Vision](../VISION.md)
- [Master Specification](../MASTER_SPECIFICATION.md)
- [Architecture 2.0](../ARCHITECTURE_2_0.md)
- [Architecture Decisions](../DECISIONS.md)
- [Staging Architecture](../STAGING_ARCHITECTURE.md)
- [Staging Deployment](../STAGING_DEPLOYMENT.md)
- [Staging Operations](../STAGING_OPERATIONS.md)
- [Staging Smoke Tests](../STAGING_SMOKE_TESTS.md)
- [Go-Live Evidence](../GO_LIVE_EVIDENCE.md)
- [Go-Live Checklist](../GO_LIVE_CHECKLIST.md)
- [TLS Validation](../TLS_VALIDATION.md)
- [Provider Validation](../PROVIDER_VALIDATION.md)
- [SBOM and Image Scanning](../SBOM_AND_IMAGE_SCANNING.md)
- [Production Readiness Checklist](../PRODUCTION_READINESS_CHECKLIST.md)
- [Security Hardening](../SECURITY_HARDENING.md)
- [Dependency Security Review](../DEPENDENCY_SECURITY_REVIEW.md)
- [TASK-005](./TASK-005.md)
