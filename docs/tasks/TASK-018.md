# TASK-018. Unified Knowledge Hub и клиентский AI-консультант

## Статус

Done — repository/application scope завершён и подтверждён unit/security, PostgreSQL/pgvector
integration, migration, browser/accessibility и production build gates. Managed staging с реальными
AI providers остаётся общим environment gate Version 2.0, а не незавершённой реализацией TASK-018.

## Ветка

`main` (reconciliation выполнена поверх `006b742` без merge устаревшей ветки PR #24; итоговый
commit определяется текущим `HEAD`)

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

- [x] Статьи индексируются после публикации.
- [x] Обновлённые статьи переиндексируются идемпотентно.
- [x] Снятые с публикации статьи не находятся.
- [x] Удалённые источники исключаются из retrieval, а index rows удаляются worker-ом.
- [x] Поиск объединяет документы и статьи.
- [x] Клиент видит только разрешённые источники своей организации.
- [x] Все содержательные ответы имеют проверенные citations.
- [x] При недостатке источников возвращается no-answer.
- [x] Проходят tenant-isolation, prompt-injection и citation tests.
- [x] Проходят доступные migration, integration, build, browser и accessibility gates.
- [x] Обновлены Backlog, Roadmap, Project Status и task registry; новые ADR/architecture changes не требуются.

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

## Результат выполнения

### Реализованный pipeline

- `DOCUMENT` и `ARTICLE` проходят через существующие lexical, semantic и hybrid retriever contracts;
- semantic retrieval создаёт один query embedding и повторно использует его для document и article
  vector search;
- article vector query проверяет active source version, generation, embedding model/version,
  `READY`, `PUBLISHED`, quarantine, visibility, owner scope и organization audience;
- lexical rank берётся из PostgreSQL FTS и смешивается с document candidates без фиксированного
  преимущества ARTICLE;
- hybrid merge сохраняет source metadata и применяет deterministic source-type/source-id ordering;
- article citations повторно разрешаются server-side по текущей статье и индексу; client/model title,
  slug, source ID и foreign article не принимаются как authoritative;
- клиентский `/api/documents/ask` сохраняет server-derived tenant, отвергает `companyId`, возвращает
  safe no-answer и используется существующим responsive `KnowledgeAsk` UI;
- UI и локальная история поддерживают document/article citations и безопасные source links.

### Lifecycle и operations

- INSERT/version/lifecycle/visibility/quarantine changes создают durable versioned index event;
- stale event не перезаписывает текущую версию, а stale index исключается join-ом с active article;
- retries используют bounded backoff; исчерпанный event получает `DEAD_LETTER`, а текущая версия
  статьи переводится в quarantine;
- DELETE создаёт durable delete event; worker удаляет lexical и vector rows до указанной версии;
- Admin Knowledge Center показывает source/publication/search/embedding status, chunk count,
  model/version, indexed time, source/index version, error/quarantine и предоставляет permission-
  protected audited reindex/retry.

### Reconciliation PR #24

Решение: **SUPERSEDED**. PR #24 (`agent/knowledge-semantic-retrieval`, `a5546fb`) расходится от
`main` после `57c6cd2`: три его commit заменены `e266c70`, `ad595db`, `5a219c5`, `006b742` и
настоящей reconciliation. Полезный semantic scope присутствует в `main`; актуальная реализация
дополнительно использует один query embedding, server-side citations, tests и lifecycle fixes.
Merge diverged ветки вернул бы старую competing implementation и не требуется. PR рекомендуется
закрыть как superseded; внешний GitHub state в рамках этой задачи не изменялся.

### Validation evidence

- Prisma generate/validate — PASS (`DATABASE_URL` для validate передан как ephemeral placeholder,
  `.env` не изменялся);
- targeted Knowledge/Hybrid RAG/security tests — PASS, 33/33;
- web unit suite — PASS, 193/193;
- PostgreSQL/pgvector lifecycle integration и full integration suite — PASS, 31/31;
- RAG integration — PASS, 1/1;
- production integration — PASS, 1/1;
- empty/legacy/repeated migration rehearsal (17 migrations) — PASS;
- lint, typecheck, formatting и `git diff --check` — PASS;
- browser suite — PASS, 77/77, включая Jira flow с первого прохода;
- отдельный accessibility suite — PASS, 13/13 без critical/serious axe findings;
- production build — PASS, 106/106 pages;
- pgvector smoke load test — PASS: recall `1`, sequential scans `0`, timeout `0`, p95 `2.568 ms`;
- static secrets/credentials/defaults/client-tenant/identity/permissions/governance/Jira/migrations
  scans — PASS без findings;
- live dependency audit — BLOCKED: sandbox не имеет DNS, а внешний `registry.npmjs.org` request с
  передачей dependency metadata не был разрешён; lockfiles и dependencies не изменялись;
- managed staging и реальные AI/Jira providers — NOT RUN и не считаются validated.

## Известные ограничения

- статья индексируется как один стабильный article chunk; отдельное paragraph-level chunking и
  reranking относятся к последующему развитию KB-002, а не к критериям TASK-018;
- история AI-консультанта всё ещё использует существующий repository, поэтому перенос истории в
  PostgreSQL, retention/consent и полноценные conversation entities остаются AI-010;
- managed staging, реальные AI providers, capacity/PITR и human operational ceremonies остаются
  общими внешними gates Version 2.0.

## Связанные документы

- [Master Specification](../MASTER_SPECIFICATION.md)
- [Vision](../VISION.md)
- [Roadmap](../ROADMAP.md)
- [Product Backlog](../PRODUCT_BACKLOG.md)
- [Architecture 2.0](../ARCHITECTURE_2_0.md)
- [Architecture Decision Records](../DECISIONS.md), ADR-0008
- [Project Status](../PROJECT_STATUS.md)
- [TASK-004](./TASK-004.md)
- [TASK-015](./TASK-015.md)
