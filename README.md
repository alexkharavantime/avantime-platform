# Avantime Platform v1.2

AI-first platform for 1C implementation, business automation, integrations, Agent+ and client support.

## Demo start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set a unique `SESSION_SECRET` with at least 32 characters in `.env.local`. To use
the local demo accounts, explicitly set `ENABLE_DEMO_AUTH="true"`; this mode is
always disabled when `NODE_ENV=production`.

Open `http://localhost:3000`.

Client: `demo@avantime.lv` / `avantime`  
Administrator: `admin@avantime.lv` / `admin`

## PostgreSQL start

```bash
docker compose up -d postgres
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Version 1.2

- company team management at `/portal/team`;
- request attachment UI and metadata API;
- Prisma `RequestAttachment` model and active user flag;
- administrator integration readiness page at `/admin/settings`;
- explicit object-storage boundary for production files.

The demo records attachment metadata only. Actual binary persistence requires S3-compatible storage and is intentionally not simulated as production-ready local storage.

## Quality

```bash
npm run db:generate
npm run typecheck
npm run lint
npm run test
npm run build
```

Production startup requires `SESSION_SECRET`; configure PostgreSQL before deployment.

## Unified client portal

`/portal` is the canonical authenticated client cabinet for requests, documents,
knowledge/RAG, company data, team, notifications and settings. Historical
`/dashboard/**` links remain compatible redirects and preserve query strings and
document deep links. Administrative document upload, deletion and reprocessing
remain separate at `/admin/documents`.

See [Portal Architecture](./docs/PORTAL_ARCHITECTURE.md) and
[TASK-007](./docs/tasks/TASK-007.md).

## Document processing worker

Development uses a persistent local queue and does not start a worker automatically.

```bash
npm run documents:worker -w @avantime/web
npm run documents:process-one -w @avantime/web
npm run documents:retry -w @avantime/web -- --document-id=<document-id> --dry-run
```

Set `DOCUMENT_WORKER_TENANT_ID` to the server-controlled tenant processed by the
worker. TASK-005 adds Redis-backed production document and embedding queue
adapters with heartbeat, lease fencing and crash recovery. Local queues remain
development/test-only.

Lifecycle, retry, quarantine and configuration details are documented in
[Document Processing](./docs/DOCUMENT_PROCESSING.md).

## Document Intelligence and local OCR

TASK-003 adds server-side format detection, text-quality assessment, OCR fallback
for PDF/PNG/JPEG and deterministic document type detection. Local OCR requires
Tesseract language data and Poppler; it never starts from an HTTP route.

```bash
npm run documents:ocr-check
npm run documents:intelligence-health
npm run documents:reprocess -- --id=<document-id> --dry-run
npm run test:ocr-integration
```

See [Document Intelligence](./docs/DOCUMENT_INTELLIGENCE.md) for installation,
configuration, lifecycle, security boundaries and current limitations.

## AI Gateway and hybrid RAG

TASK-004 adds a server-side AI Gateway, asynchronous tenant-aware chunk embeddings,
PostgreSQL/pgvector storage, lexical/semantic/hybrid retrieval and server-validated
citations. Development and tests use a deterministic fake provider; production
fails fast unless real providers, PostgreSQL embedding jobs and RAG readiness are
configured.

```bash
npm run documents:embedding-worker
npm run documents:embedding-check
npm run documents:vector-check
npm run documents:reindex -- --document-id=<id> --dry-run
npm run documents:rag-evaluate
npm run test:rag-integration
```

See [AI Gateway](./docs/AI_GATEWAY.md), [Hybrid RAG](./docs/HYBRID_RAG.md) and
[Document Operations](./docs/DOCUMENT_OPERATIONS.md) for configuration, lifecycle,
security, evaluation and integration commands.

## Production readiness operations

TASK-005 adds production configuration validation, Redis coordination,
distributed AI limits, a persistent EUR usage/budget ledger, audit/telemetry,
backup/restore rehearsal, pgvector load testing and hardened container/reference
deployment manifests.

```bash
npm run production:config-check
npm run queue:health-check
npm run workers:heartbeat-check
npm run ai:cost-report -- --days=30
npm run backup:dry-run
npm run restore:rehearsal:integration
npm run pgvector:load-test -- --integration --smoke
npm run production:readiness
```

Start with [Production Architecture](./docs/PRODUCTION_ARCHITECTURE.md),
[Production Deployment](./docs/PRODUCTION_DEPLOYMENT.md) and the
[Production Readiness Checklist](./docs/PRODUCTION_READINESS_CHECKLIST.md).
Reference manifests contain no real credentials and are not evidence that a
managed production environment is ready.

## Document integration validation

PostgreSQL/MinIO integration infrastructure is isolated from the normal development
stack and never starts automatically:

```bash
cp .env.integration.example .env.integration
npm run integration:up
npm run test:integration
npm run documents:migration-rehearsal
npm run documents:health-check:integration
npm run integration:clean
npm run integration:down
```

The normal `npm test` command does not require Docker. The integration environment
includes PostgreSQL/pgvector, MinIO and Redis. The integration commands
reject production mode, remote endpoints and database/bucket names without an
`integration` marker. See [Document Operations](./docs/DOCUMENT_OPERATIONS.md)
for migration rehearsal, health, worker shutdown and cleanup details.

## v1.2

- real attachment upload and download
- local file storage adapter
- password reset tokens and pages
- administrator system event journal

## v1.3

- email queue and templates
- Resend adapter with console fallback
- notification preferences
- admin email queue

## v1.4 — управляемая база знаний

- полнотекстовый поиск по заголовкам, описаниям, категориям и тегам;
- фильтрация по категориям;
- административное создание черновиков;
- публикация и архивирование материалов;
- PostgreSQL-модель `KnowledgeArticle` с демонстрационным fallback;
- автоматические рекомендации статей в карточке клиентского обращения.

После обновления схемы выполните:

```bash
npm run db:generate
npm run db:migrate
```

## macOS Big Sur

Для macOS Big Sur 11 используйте инструкции из [INSTALL_BIG_SUR.md](./INSTALL_BIG_SUR.md). В версии 1.5 закреплена совместимая версия `esbuild@0.26.0`.
