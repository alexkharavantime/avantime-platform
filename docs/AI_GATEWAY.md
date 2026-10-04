# AI Gateway

AI Gateway — единственная server-side граница вызова моделей в Avantime Platform. Реализация TASK-004 обслуживает document embeddings, query embeddings, RAG answers и прежний административный AI route.

## Контракты и adapters

`AiGateway` использует независимые контракты `EmbeddingProvider` и `RagAnswerProvider`. Прикладные сервисы и API не импортируют SDK провайдеров и не формируют provider-specific payload. Централизованная конфигурация выбирает:

- `fake` — детерминированный provider только для явно настроенных локальных сценариев и tests;
- `openai` — embeddings и Responses API;
- `gemini` — embeddings и generation через существующий Gemini SDK;
- `disabled` — явное отключение вне production.

Ошибки преобразуются в безопасные коды `AI_*`; raw provider response, stack trace, ключ, prompt, answer, document text и vector не возвращаются клиенту и не записываются в operational events.

## Политики выполнения

Gateway применяет:

- timeout и один повтор только для transient ошибок;
- от одной до двух попыток provider request (`AI_PROVIDER_MAX_ATTEMPTS`, по умолчанию `2`);
- Redis-backed tenant/user/provider burst, minute/day limits в production;
- race-safe daily/monthly/provider budget reservation в EUR;
- лимиты input context и output tokens;
- correlation ID, usage metadata и оценочную стоимость;
- отдельную readiness-проверку embedding и answer providers.

Development limits могут храниться в памяти одного процесса. TASK-005 добавляет production Redis limiter, PostgreSQL append-only usage/cost ledger и budget reservation до provider call. Автоматический provider fallback остаётся отдельным решением.

## Local OpenAI verification

The development web app loads environment files from the repository root through
`apps/web/next.config.ts`. The dedicated real-AI browser runner also explicitly loads the
repository-root `.env`. Worker scripts normally inherit the environment of their launcher and do
not load `.env` themselves; use `npm run documents:embedding-worker:local -w @avantime/web` for a
local embedding worker. Containerized staging and production workers receive settings from their
deployment environment files or runtime environment.

Keep the repository-root `.env` ignored by Git and leave `.env.example` on fake defaults. For a
deliberate OpenAI run, select `openai` for `DOCUMENT_EMBEDDING_DRIVER` and `RAG_ANSWER_DRIVER`.
The existing adapter defaults are `text-embedding-3-small` with 1536 dimensions and `gpt-5-mini`;
these are controlled by `DOCUMENT_EMBEDDING_MODEL`, `DOCUMENT_EMBEDDING_DIMENSIONS`, and
`RAG_ANSWER_MODEL`. `OPENAI_MODEL` is not used by the document RAG adapter.

Run the isolated, synthetic-data smoke explicitly with
`npm run test:browser:real-ai -w @avantime/web`. It requires a loopback `DATABASE_URL` for the
local `avantime` database, creates and cleans a unique test database and storage directory, and
does not accept caller-supplied database overrides. The fixture uses two synthetic one-page PDFs,
five questions, exactly 12 planned provider operations, one Gateway attempt with OpenAI SDK retries
disabled per operation, and 250 output tokens per answer. The test-only PostgreSQL reservation
controller applies one shared EUR 0.25/day and EUR 1/month cap across the web and worker processes
before each provider call. The configured per-request-type rate caps are 10 requests/minute,
5/day, and a burst of 3; questions are spaced to honor the burst window. Cross-tenant ACL checks
use lexical retrieval and direct document routes so they do not issue additional provider queries.
Ordinary unit tests keep the `fake` provider; ordinary browser runs strip provider API keys.

OpenAI readiness checks only that credentials are configured: listing models requires a separate
read permission not needed by the Responses and Embeddings endpoints. The real-AI smoke, not the
readiness probe, verifies those endpoint permissions. Its PostgreSQL reservations use Avantime's
estimated costs and are shared across the isolated web/worker processes; ordinary development may
use in-memory limits. Neither is a guaranteed provider invoice ceiling. Use a dedicated OpenAI
project with a low usage alert as an additional external safeguard.

## Production fail-fast

Production требует явные:

- `DOCUMENT_EMBEDDING_DRIVER` и `RAG_ANSWER_DRIVER`, отличные от `fake`/`disabled`;
- provider credentials для выбранных adapters;
- `DOCUMENT_VECTOR_DRIVER=pgvector`;
- Redis-backed external document/embedding queues и `REDIS_URL` с TLS/authentication;
- `DATABASE_URL`;
- `DOCUMENT_RAG_REQUIRED_FOR_READINESS=true`.

Неполная или противоречивая конфигурация отклоняется при создании сервисов. Readiness не считается готовым, если настроенный provider недоступен.

## Наблюдаемость

`AiOperationalEventSink` и TASK-005 `ProductionTelemetry` принимают только структурированные metadata: hashed tenant reference, correlation ID, outcome, latency, количество результатов/chunks, tokens, estimated cost и безопасный error code. No-op/console adapters предназначены для development; OpenTelemetry-compatible adapter подключает выбранный production collector. Persistent usage/audit хранятся отдельно от технической telemetry.

## Связанные документы

- [Hybrid RAG](./HYBRID_RAG.md)
- [Architecture 2.0](./ARCHITECTURE_2_0.md)
- [Architecture Decisions](./DECISIONS.md)
- [Document Operations](./DOCUMENT_OPERATIONS.md)
- [TASK-004](./tasks/TASK-004.md)
- [TASK-005](./tasks/TASK-005.md)
- [AI Cost Control](./AI_COST_CONTROL.md)
- [Observability](./OBSERVABILITY.md)
