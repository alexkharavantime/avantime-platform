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
- tenant/user rate limit;
- дневной tenant budget;
- лимиты input context и output tokens;
- correlation ID, usage metadata и оценочную стоимость;
- отдельную readiness-проверку embedding и answer providers.

Development limits хранятся в памяти одного процесса. Распределённый rate limit, долговечный cost ledger, автоматический provider fallback и внешняя metrics platform не входят в TASK-004.

## Production fail-fast

Production требует явные:

- `DOCUMENT_EMBEDDING_DRIVER` и `RAG_ANSWER_DRIVER`, отличные от `fake`/`disabled`;
- provider credentials для выбранных adapters;
- `DOCUMENT_VECTOR_DRIVER=pgvector`;
- `DOCUMENT_EMBEDDING_QUEUE_DRIVER=postgresql`;
- `DATABASE_URL`;
- `DOCUMENT_RAG_REQUIRED_FOR_READINESS=true`.

Неполная или противоречивая конфигурация отклоняется при создании сервисов. Readiness не считается готовым, если настроенный provider недоступен.

## Наблюдаемость

`AiOperationalEventSink` принимает только структурированные metadata: tenant ID, correlation ID, outcome, latency, количество результатов/chunks, tokens, estimated cost и безопасный error code. Встроенная in-memory реализация используется для локальной сводки; production sink и retention policy относятся к следующему инфраструктурному этапу.

## Связанные документы

- [Hybrid RAG](./HYBRID_RAG.md)
- [Architecture 2.0](./ARCHITECTURE_2_0.md)
- [Architecture Decisions](./DECISIONS.md)
- [Document Operations](./DOCUMENT_OPERATIONS.md)
- [TASK-004](./tasks/TASK-004.md)
