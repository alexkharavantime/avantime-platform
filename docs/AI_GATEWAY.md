# AI Gateway

AI Gateway — единственная server-side граница вызова моделей в Avantime Platform. Реализация TASK-004 обслуживает document embeddings, query embeddings, RAG answers и прежний административный AI route.

## Контракты и adapters

`AiGateway` использует независимые контракты `EmbeddingProvider` и `RagAnswerProvider`. Прикладные сервисы и API не импортируют SDK провайдеров и не формируют provider-specific payload. Централизованная конфигурация выбирает:

- `fake` — детерминированный provider для development, unit и integration tests;
- `openai` — embeddings и Responses API;
- `gemini` — embeddings и generation через существующий Gemini SDK;
- `disabled` — явное отключение вне production.

Ошибки преобразуются в безопасные коды `AI_*`; raw provider response, stack trace, ключ, prompt, answer, document text и vector не возвращаются клиенту и не записываются в operational events.

## Политики выполнения

Gateway применяет:

- timeout и один повтор только для transient ошибок;
- Redis-backed tenant/user/provider burst, minute/day limits в production;
- race-safe daily/monthly/provider budget reservation в EUR;
- лимиты input context и output tokens;
- correlation ID, usage metadata и оценочную стоимость;
- отдельную readiness-проверку embedding и answer providers.

Development limits могут храниться в памяти одного процесса. TASK-005 добавляет production Redis limiter, PostgreSQL append-only usage/cost ledger и budget reservation до provider call. Автоматический provider fallback остаётся отдельным решением.

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
