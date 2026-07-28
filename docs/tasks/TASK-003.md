# TASK-003. Document Intelligence and Hybrid RAG

## Статус

Draft

## Ветка

Не определена.

## Цель

Спроектировать и реализовать следующий функциональный этап Document Platform: извлечение знаний из разных типов документов и безопасный hybrid RAG с проверяемыми citations.

## Контекст

TASK-002 формирует tenant-aware storage, metadata, processing lifecycle и operational boundaries. Текущий pipeline обрабатывает PDF, использует лексический поиск и не имеет OCR, embeddings, vector storage или AI Gateway. TASK-003 начинается только после завершения инфраструктурной валидации TASK-002 и принятия связанных архитектурных решений.

## Scope

- OCR для сканированных документов;
- определение типа и способа обработки документа;
- создание tenant-aware embeddings;
- выбор и подключение vector storage;
- semantic search;
- hybrid retrieval, объединяющий lexical и semantic results;
- citations с проверяемой привязкой к документу и chunk;
- интеграция retrieval/answer flow с AI Gateway;
- evaluation dataset без production-sensitive данных;
- автоматические relevance и security tests.

## Out of scope

- изменение storage/processing contracts TASK-002 без отдельного ADR;
- ослабление tenant isolation или текущей `ADMIN`-границы Document API;
- объединение `/portal` и `/dashboard`;
- расширение общей RBAC;
- выбор production external queue provider;
- публичный UI, не связанный с Document Intelligence;
- использование реальных клиентских документов в evaluation dataset.

## Требования безопасности

- каждый chunk, embedding, retrieval result и citation содержит обязательный `companyId`;
- tenant определяется только из server-side session/context;
- retrieval работает deny-by-default при отсутствии tenant или разрешения;
- удалённые, quarantined и недоступные документы не участвуют в поиске;
- prompts, traces и evaluation artifacts не раскрывают содержимое документов и секреты;
- AI Gateway применяет утверждённые provider, data classification и audit policies;
- security tests проверяют межкорпоративный доступ на каждом этапе retrieval.

## Критерии готовности

- [ ] Утверждены ADR для embeddings/vector storage, OCR и AI Gateway integration.
- [ ] Реализовано определение типа документа и OCR fallback.
- [ ] Embeddings и vector records tenant-aware и удаляются согласованно с metadata lifecycle.
- [ ] Semantic и hybrid retrieval не возвращают данные другого tenant.
- [ ] Каждый ответ содержит проверяемые citations на разрешённые chunks.
- [ ] Подготовлен безопасный evaluation dataset и измеримые relevance thresholds.
- [ ] Пройдены relevance, regression, tenant isolation и prompt/data leakage tests.
- [ ] Обновлены архитектурная, эксплуатационная и продуктовая документация.

## План реализации

1. Зафиксировать ADR и критерии качества retrieval.
2. Определить type detection и OCR contracts.
3. Спроектировать tenant-aware embedding/vector lifecycle.
4. Реализовать semantic retrieval и объединение с lexical search.
5. Добавить citations и интеграцию через AI Gateway.
6. Создать evaluation dataset и автоматические relevance/security gates.
7. Провести нагрузочную, стоимостьную и эксплуатационную оценку.

## Риски

- извлечённый OCR-текст и embeddings могут содержать чувствительные данные;
- неверные tenant filters в vector search создают риск межкорпоративной утечки;
- качество retrieval зависит от chunking, модели embeddings и evaluation coverage;
- citations могут быть формально корректными, но не подтверждать ответ;
- provider changes влияют на стоимость, latency и воспроизводимость оценки;
- удаление и переиндексация должны быть согласованы с lifecycle TASK-002.

## Результат выполнения

Задание создано как `Draft`. Реализация в рамках текущей итерации не выполнялась.

## Связанные документы

- [Vision](../VISION.md)
- [Master Specification](../MASTER_SPECIFICATION.md)
- [Architecture 2.0](../ARCHITECTURE_2_0.md)
- [Architecture Decisions](../DECISIONS.md)
- [Roadmap](../ROADMAP.md)
- [Product Backlog](../PRODUCT_BACKLOG.md)
- [Project Status](../PROJECT_STATUS.md)
- [Document Processing](../DOCUMENT_PROCESSING.md)
- [Document Operations](../DOCUMENT_OPERATIONS.md)
- [TASK-002](./TASK-002.md)
