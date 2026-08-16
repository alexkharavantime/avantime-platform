# TASK-018. Unified Knowledge Hub и клиентский AI-консультант

## Статус

Planned

## Ветка

`feature/task-018-knowledge-hub`

# TASK-018. Unified retrieval для клиентского AI-консультанта

## Цель

Расширить существующий клиентский RAG так, чтобы AI-консультант использовал не только tenant-документы, но и разрешённые статьи Knowledge Hub, сохраняя tenant isolation, visibility policy, citations и безопасный no-answer.

## Предпосылки

TASK-004 уже реализовала:

- AI Gateway;
- embeddings;
- pgvector;
- lexical, semantic и hybrid retrieval;
- server-generated citations;
- embedding queue и worker;
- tenant-aware document chunks;
- prompt-injection и tenant-isolation safeguards.

TASK-018 расширяет существующий RAG на новые типы источников и клиентский интерфейс.

## Scope

- подключить KnowledgeSearchIndex к lexical retrieval;
- подключить KnowledgeVectorIndex к semantic retrieval;
- объединить document и article candidates;
- нормализовать citations;
- исключить PRIVATE, DRAFT, REVIEW и quarantined статьи;
- разрешить PUBLIC, PLATFORM и допустимые ORGANIZATION статьи;
- сохранить server-derived companyId;
- добавить regression и tenant-isolation tests;
- обновить UI citations для article sources.
### Индексация статей

- публикация статьи создаёт индексируемые chunks;
- обновление статьи запускает переиндексацию;
- снятие с публикации исключает статью из retrieval;
- удаление удаляет или деактивирует связанные vectors;
- обработка идемпотентна;
- ошибки получают retry и quarantine.

### Единый retrieval

Поиск объединяет:

- document chunks;
- article chunks;
- FAQ;
- инструкции;
- кейсы.

Результат содержит:

- source type;
- source id;
- title;
- score components;
- tenant;
- language;
- citation metadata;
- access scope.

### Клиентский AI-чат

- доступ только авторизованным пользователям;
- tenant определяется сервером;
- клиент не может передать другой companyId;
- AI использует только разрешённые источники;
- каждый содержательный ответ содержит citations;
- при недостаточной доказательной базе возвращается no-answer;
- неопубликованные и чужие материалы исключаются;
- prompt injection внутри документов считается недоверенными данными.

### Административный интерфейс

Knowledge Center показывает:

- все источники;
- тип источника;
- статус публикации;
- embedding status;
- число chunks;
- модель и версию embedding;
- дату индексации;
- ошибки;
- quarantine;
- безопасную переиндексацию.

## Out of scope

- публичный анонимный AI-чат;
- интернет-поиск;
- голосовой интерфейс;
- автоматическое создание Jira ticket;
- индексация всей истории Jira;
- AI agents;
- fine-tuning;
- production marketplace;
- генерация нормативных заключений без источников.

## Безопасность

- deny-by-default для knowledge access;
- tenant isolation во всех repository и retrieval запросах;
- серверное построение citations;
- запрет companyId из client payload;
- фильтрация unpublished, deleted, failed и quarantined источников;
- защита от prompt injection;
- отсутствие raw document text и secrets в логах;
- rate, token и cost limits через AI Gateway;
- audit trail для AI-запросов и переиндексации.

## Критерии готовности

- [ ] Статьи индексируются после публикации.
- [ ] Обновлённые статьи переиндексируются идемпотентно.
- [ ] Снятые с публикации статьи не находятся.
- [ ] Удалённые источники исключаются из retrieval.
- [ ] Поиск объединяет документы и статьи.
- [ ] Клиент видит только разрешённые источники своей организации.
- [ ] Все содержательные ответы имеют проверенные citations.
- [ ] При недостатке источников возвращается no-answer.
- [ ] Проходят tenant-isolation, prompt-injection и citation tests.
- [ ] Проходят migration, integration, build и staging gates.
- [ ] Обновлены Architecture, Decisions, Backlog, Roadmap и Project Status.

## План реализации

### Итерация 1. Архитектурный контракт и модель данных

- KnowledgeSource;
- KnowledgeChunk;
- KnowledgeIndexEvent;
- типы источников;
- access scope;
- lifecycle статусов;
- migration;
- repository contracts.

### Итерация 2. Индексация статей

- article chunking;
- indexing event;
- embedding worker integration;
- publish/update/unpublish lifecycle;
- quarantine;
- unit и integration tests.

### Итерация 3. Unified retrieval

- общий retriever;
- source-type filtering;
- deterministic ranking;
- citation builder;
- multilingual behavior;
- regression dataset.

### Итерация 4. Клиентский AI-чат

- API;
- session/history;
- UI;
- no-answer;
- citations;
- переход к созданию обращения как отдельное действие.

### Итерация 5. Admin Knowledge Center

- список источников;
- фильтры;
- статусы индексации;
- безопасная переиндексация;
- ошибки и quarantine;
- operational metrics.

## Риски

- дублирование существующих Article и Document моделей;
- расхождение permission model;
- несогласованное удаление vectors;
- чрезмерное усложнение общей модели источников;
- увеличение стоимости embeddings;
- некачественное ранжирование смешанных источников;
- утечка неопубликованных или tenant-owned материалов.

## Принципы реализации

1. Не дублировать AI Gateway и RAG ядро.
2. Расширять существующие контракты.
3. Сохранять deny-by-default.
4. Делать миграции обратимо и PostgreSQL-safe.
5. Не ослаблять CI и staging readiness.
6. Публиковать изменения через отдельный PR.
