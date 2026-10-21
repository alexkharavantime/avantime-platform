# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mandatory project rules

These come from `AGENTS.md` and `docs/CODEX_RULES.md` (read the latter before each task; the full
completion procedure is in `docs/CODEX_WORKFLOW.md`):

- Reply to the user in **Russian**. Code, identifiers, file names, API names and code comments are
  in English; add comments only when genuinely needed.
- Never `git commit` / `git push` without explicit user confirmation.
- Do not change project architecture, remove existing functionality, add dependencies, or edit
  `.env*` files / deployment settings without the user's approval.
- Preserve compatibility of existing pages, APIs, the client portal and integrations (e.g. legacy
  `/dashboard/**` links must keep redirecting to `/portal/**`).
- Work in small logical steps; preserve the user's uncommitted changes; touch only task files.
  Apply formatting only to files changed by the task (repository-wide formatting debt is not fixed
  in passing).
- Before finishing: run applicable checks (lint, typecheck, build, tests), then report changed
  files, a short explanation, check results, errors found (explicitly marking those unrelated to
  the change), and a proposed commit message.
- Product priorities: 1C implementation/support first, then AI, cloud, integrations, EDI,
  Agent+, client portal, knowledge base, Jira, news/articles/webinars.

## Commands

npm workspaces + Turborepo (`npm@10`, Node 20 in CI). Run from the repository root unless noted.

```bash
npm install
npm run db:generate        # Prisma client — required before typecheck/test/build
npm run dev                # turbo dev; web uses scripts/start-local-rag.ts "real" profile
npm run dev:fake -w @avantime/web   # fake AI providers + in-memory vectors (UI/flow only)
npm run typecheck          # CI uses: npm run typecheck -- --force
npm run lint
npm run test               # unit/security/contract tests, no Docker/browser/network
npm run build
npm run format             # prettier --write . (avoid; format only touched files)
```

Single unit test file (tests use the built-in `node:test` runner via `tsx`, not Jest/Vitest):

```bash
cd apps/web
node --import tsx --test tests/hybrid-rag.test.ts
node --import tsx --test --test-name-pattern="some name" tests/hybrid-rag.test.ts
```

`npm run test` in `apps/web` runs every `apps/web/tests/*.test.ts` (see
`scripts/run-unit-tests.ts`). Integration tests live in `apps/web/tests/integration/*.integration.test.ts`.

Focused suites: `test:identity`, `test:permissions`, `test:governance-validation`, plus static
scans `npm run security:<secret|identity|permission|client-tenant|governance|jira|...>-scan -w @avantime/web`.

Integration (Docker: PostgreSQL/pgvector, MinIO, Redis):

```bash
cp .env.integration.example .env.integration
npm run integration:up
npm run test:integration            # add -- --test-name-pattern="..." to filter
npm run test:rag-integration
npm run test:production-integration
npm run integration:down
```

Browser (Playwright, Chromium, axe WCAG A/AA; needs `integration:up` + `npx playwright install chromium`):
`npm run test:browser -w @avantime/web`, `test:accessibility`, `test:browser:headed`. Reports go
to `.artifacts/playwright-report`.

Local PostgreSQL only: `docker compose up -d postgres`, then `db:generate`, `db:migrate`, `db:seed`.
Demo login requires `ENABLE_DEMO_AUTH="true"` and a 32+ char `SESSION_SECRET` (never active in production).

## Architecture

- `apps/web` — the single Next.js 15 (App Router, React 19, Tailwind 4) app: public site,
  client portal (`/portal`), admin (`/admin`), platform governance, and all API routes
  (`app/api/**`). Nearly all business logic lives in flat modules under `apps/web/lib/`.
  Operational CLIs and workers are `apps/web/scripts/*.ts` run with `tsx` and exposed as npm scripts.
- `packages/database` — Prisma schema/migrations/seed; `getPrisma()` lazily loads the client and
  returns `null` when `DATABASE_URL` is unset, so callers must handle a missing database.
- `packages/ui`, `packages/shared` — shared components and constants.

Cross-cutting patterns:

- **Driver/adapter selection via env.** Storage (local FS vs S3/MinIO), metadata (local JSON vs
  PostgreSQL), queues (local file queue vs Redis lease queue), vectors (in-memory vs pgvector),
  AI providers (`fake`/`openai`/`gemini`/`disabled`), Jira and notification providers all have
  local/test adapters and production adapters. Composition roots are `lib/document-services.ts`,
  `lib/rag-services.ts` and the `*-configuration.ts` loaders, which fail fast; production rejects
  local adapters. Tests and CI use only deterministic local adapters — no real providers.
- **Tenant isolation.** Tenant (`companyId`) is always derived server-side from the session (or
  worker env), never from client query/body. `middleware.ts` guards protected API prefixes and
  handles locale routing; authorization is deny-by-default via `lib/organization-permissions.ts`
  (OWNER/ADMIN/MANAGER/MEMBER/VIEWER) and separate platform roles (`lib/platform-permissions.ts`).
  Legacy global `User.role` must not authorize tenant resources.
- **Document → RAG pipeline.** Upload (admin) → processing queue → document worker (PDF extract,
  OCR, text quality, chunking; status transitions only through `document-processing-state.ts`) →
  separate embedding queue/worker → pgvector → hybrid retrieval (`retrieval.ts`) → answers via
  `rag-answer.ts`. Workers are separate processes, not started by `dev`.
- **AI Gateway** (`lib/ai-gateway.ts`) is the only place model SDKs are called: retries, rate
  limits, EUR budget reservation against a PostgreSQL usage ledger, safe `AI_*` error codes.
  Never return/log raw provider responses, prompts, document text or vectors.
- **Durable outboxes/workers** for notifications, Jira outbound/inbound webhooks and knowledge
  indexing use leases, fencing, retry/DLQ and idempotency.
- **i18n**: public site uses `/lv` (default), `/ru`, `/en` prefixes rewritten by middleware;
  shared strings in `lib/i18n.ts` (all three locales). `/portal`, `/admin`, `/dashboard` are not localized.

Local RAG specifics: the root `.env` is loaded by `next.config.ts` and the `*:local` worker
scripts; `DOCUMENT_DATA_DIR` resolves to `apps/web/.data` by default
(`lib/document-data-directory.ts`). The real-provider dev profile refuses to start unless the
effective AI daily and monthly budgets are positive (`AiBudgetPolicy` overrides the env budget).
The real profile (`lib/local-rag-profile.ts`) forces OpenAI/pgvector drivers,
`RAG_MAX_OUTPUT_TOKENS=2000` and `RAG_REASONING_EFFORT=low` over the fake defaults in `.env`;
the generic `documents:worker` commands keep `.env` fake drivers, so use the `*:local` variants.
Log in via `http://127.0.0.1:3000` — `AUTH_PUBLIC_ORIGIN` rejects login posted from `localhost`.
Do not start local workers for read-only checks — they process queued jobs. See
`docs/LOCAL_RAG_CONFIGURATION.md` and `docs/LOCAL_MANUAL_PDF_CHECK.md`.

Detailed design docs live in `docs/` (e.g. `DOCUMENT_PROCESSING.md`, `HYBRID_RAG.md`,
`AI_GATEWAY.md`, `AUTHORIZATION_ARCHITECTURE.md`, `IDENTITY_ARCHITECTURE.md`,
`PORTAL_ARCHITECTURE.md`, `TESTING.md`, `BROWSER_TESTING.md`); task specs are in `docs/tasks/TASK-*.md`.
