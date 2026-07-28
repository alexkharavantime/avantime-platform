# TASK-004. AI Gateway, Embeddings и Hybrid RAG

## Статус

Draft

## Ветка

Не определена.

## Цель

Создать единый AI Gateway boundary и добавить tenant-aware embeddings, vector storage, semantic/hybrid retrieval и проверяемые citations поверх завершённого Document Intelligence/OCR pipeline TASK-003.

## Контекст

TASK-003 завершила безопасное определение формата, оценку качества текста, OCR fallback, Document Intelligence metadata и раздельные core/OCR readiness components. Поиск остаётся лексическим, embeddings и vector storage не реализованы, а существующие AI-маршруты ещё не объединены общим AI Gateway.

## Scope

- единый AI Gateway contract для авторизации, маршрутизации, журналирования и нормализации AI-вызовов;
- provider adapters и перенос retrieval/answer model calls за AI Gateway boundary;
- версионированные tenant-aware embeddings документов и статей;
- выбор и проверка vector storage с безопасной migration;
- semantic retrieval и объединение с существующим lexical search;
- tenant, permission и lifecycle filters до retrieval;
- проверяемые citations на разрешённые документы и chunks;
- безопасная переиндексация и согласованное удаление vector records;
- evaluation dataset без production-sensitive данных;
- relevance, regression, tenant-isolation и data-leakage tests;
- эксплуатационная, архитектурная и продуктовая документация.

## Out of scope

- изменение завершённого OCR/runtime boundary TASK-003 без отдельного решения;
- cloud OCR provider и новые document formats;
- выбор production S3 или external queue provider;
- ослабление текущих tenant, RBAC или ADMIN boundaries;
- объединение `/portal` и `/dashboard`.

## Требования безопасности

- каждый embedding, vector record, retrieval result и citation содержит обязательный tenant context;
- права и tenant filters применяются до semantic и lexical retrieval;
- удалённые, quarantined и недоступные документы не участвуют в поиске;
- prompts, traces, evaluation artifacts и логи не раскрывают содержимое документов или секреты;
- модели вызываются только через утверждённый AI Gateway;
- reindex/delete lifecycle не оставляет доступных orphan vector records.

## Критерии готовности

- [ ] Утверждены применимые решения для AI Gateway, embeddings и vector storage.
- [ ] Retrieval/answer model calls выполняются только через единый AI Gateway contract.
- [ ] Реализованы версионированные tenant-aware embeddings и безопасная migration.
- [ ] Semantic и hybrid retrieval не возвращают данные другого tenant.
- [ ] Каждый ответ содержит проверяемые citations на разрешённые chunks.
- [ ] Удаление и переиндексация согласованы с document lifecycle.
- [ ] Подготовлен безопасный evaluation dataset и измеримые relevance thresholds.
- [ ] Пройдены relevance, regression, tenant-isolation и data-leakage tests.
- [ ] Пройдены production build и применимые integration gates.
- [ ] Обновлена связанная документация и завершена security review.

## План реализации

1. Утвердить contracts AI Gateway, embeddings и vector storage.
2. Спроектировать tenant-aware embedding/vector lifecycle и migration.
3. Реализовать asynchronous indexing и versioned reindex.
4. Добавить semantic retrieval и deterministic hybrid merge.
5. Добавить citations и AI Gateway answer flow.
6. Подготовить evaluation dataset и автоматические quality/security gates.
7. Выполнить integration, migration, performance и operational validation.

## Результат выполнения

Задание создано как `Draft`. Реализация в рамках TASK-004 не начиналась.

## Известные ограничения

- конкретный vector storage не выбран;
- полный перенос существующих OpenAI/Gemini маршрутов должен быть согласован с backlog-задачей AI-001;
- production external queue и monitoring требуют отдельных задач;
- relevance thresholds должны быть подтверждены на безопасном evaluation dataset.

## Связанные документы

- [Vision](../VISION.md)
- [Master Specification](../MASTER_SPECIFICATION.md)
- [Architecture 2.0](../ARCHITECTURE_2_0.md)
- [Architecture Decisions](../DECISIONS.md)
- [Roadmap](../ROADMAP.md)
- [Product Backlog](../PRODUCT_BACKLOG.md)
- [Project Status](../PROJECT_STATUS.md)
- [Document Intelligence](../DOCUMENT_INTELLIGENCE.md)
- [Document Processing](../DOCUMENT_PROCESSING.md)
- [TASK-003](./TASK-003.md)
