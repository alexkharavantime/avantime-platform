# TASK-004. AI Gateway, Embeddings и Hybrid RAG

## Статус

Done

## Ветка

`feature/task-004-hybrid-rag`

## Цель

Создать единый AI Gateway boundary и добавить tenant-aware embeddings, PostgreSQL/pgvector, lexical/semantic/hybrid retrieval и проверяемые server-generated citations поверх завершённого Document Intelligence/OCR pipeline TASK-003.

## Scope

- единые `AiGateway`, embedding и answer provider contracts;
- асинхронные версионированные embeddings document chunks;
- tenant-aware vector storage в PostgreSQL/pgvector;
- отдельная PostgreSQL/local embedding queue и worker lifecycle;
- сохранение lexical search, semantic search и deterministic hybrid merge;
- безопасная RAG answer generation и server-generated citations;
- ADMIN-only API и минимальное обновление Knowledge Center;
- single-document dry-run/reindex с production/remote guards;
- разделённые core, OCR, embedding/vector и RAG readiness components;
- synthetic multilingual evaluation dataset и regression runner;
- migration, unit, security, integration и operational gates.

## Out of scope

- расширение OCR или поддержка Word/Excel extraction;
- индексация статей и объединение двух Knowledge Center implementations;
- client-facing RAG и расширение RBAC за пределы существующего `ADMIN`;
- production S3 provider, external document queue, distributed rate limiter и monitoring platform;
- neural reranker, отдельная vector database, массовый reindex;
- CRM, Jira, `/portal`, публичный AI-chat и AI Agents.

## Архитектурные контракты

Добавлены:

- `EmbeddingProvider`, `EmbeddingRequest`, `EmbeddingResult`;
- `VectorRepository`, `VectorSearchRequest`, `VectorSearchResult`;
- `EmbeddingJobQueue`, `DocumentEmbeddingWorker`;
- `LexicalRetriever`, `SemanticRetriever`, `HybridRetriever`;
- `CitationBuilder`, `RagAnswerService`;
- `AiGateway`, `AiOperationalEventSink`.

API routes используют фабрику сервисов, не создают adapters и не принимают tenant из client payload. Provider-specific SDK/payload сосредоточены в AI Gateway.

## Реализованный lifecycle

1. Document worker завершает checksum-verified extraction и сохраняет актуальные chunks.
2. Отдельный embedding job ставится идемпотентно.
3. Embedding worker получает lease и обрабатывает изменившиеся chunks batches.
4. SHA-256 content hash исключает повторную векторизацию неизменившегося chunk.
5. Vector record сохраняет tenant, document/chunk, model, version и dimensions.
6. Stale chunks удаляются; прежняя model/version очищается только после успешного завершения новой.
7. Transient ошибки получают retry/backoff, permanent — `FAILED`, исчерпание попыток — `QUARANTINED`.
8. Document processing status остаётся независимым от embedding status.

## Безопасность

- tenant обязателен во всех repository, queue, retrieval, citation и provider requests;
- `companyId` в новых body/query API отклоняется;
- поиск включает только `COMPLETED`, не удалённые документы с `embeddingStatus=COMPLETED`;
- citations повторно строятся из разрешённых metadata/chunks server-side;
- неизвестные citation IDs удаляются;
- documents считаются недоверенными данными и изолируются от system instructions;
- query/context/output, timeout, rate и budget limits валидируются централизованно;
- raw provider errors, prompts, answers, document text, vectors и secrets не логируются;
- production требует реальные providers, PostgreSQL queue/pgvector и RAG readiness;
- reindex по умолчанию dry-run и требует явных production/remote разрешений.

## Критерии готовности

- [x] Утверждены применимые решения для AI Gateway, embeddings, pgvector, hybrid ranking и citation policy.
- [x] Retrieval/answer model calls выполняются только через единый AI Gateway contract.
- [x] Реализованы версионированные tenant-aware embeddings и безопасная migration.
- [x] Semantic/hybrid retrieval исключает другой tenant, deleted, failed и quarantined lifecycle.
- [x] RAG answers используют только server-validated citations на разрешённые chunks.
- [x] Удаление, processing и single-document reindex согласованы с vector lifecycle.
- [x] Подготовлен multilingual synthetic evaluation dataset с измеримыми метриками.
- [x] Пройдены regression, prompt-injection, tenant-isolation и leakage tests.
- [x] Пройдены production build, migration rehearsal и PostgreSQL/MinIO/pgvector/OCR integration gates.
- [x] Обновлены architecture, operations, project, backlog и roadmap documents.

## Результат выполнения

TASK-004 завершена 2026-07-28.

Реализованы PostgreSQL migration с `pgvector`, embedding metadata/job/vector tables, отдельный embedding worker, централизованный AI Gateway с fake/OpenAI/Gemini adapters, lexical/semantic/hybrid retrievers, RAG answers и server citations. Knowledge Center показывает mode, score components, indexing status, answer/no-answer и citations.

Readiness теперь независимо показывает:

- core document processing;
- Document Intelligence/OCR;
- embedding/vector;
- RAG/AI Gateway.

Production readiness не ослаблена: OCR и RAG остаются обязательными при production configuration; отсутствие настроенного runtime/provider/vector boundary делает overall readiness `unavailable`.

Фактически пройдены:

- unit/security tests: 90/90;
- PostgreSQL/MinIO/local queue/pgvector/RAG integration tests: 17/17;
- real OCR Docker integration с Tesseract/Poppler: 1/1;
- empty/legacy/repeated migration rehearsal;
- document health, worker, embedding и vector checks;
- Prisma generation/schema validation, typecheck, lint и production build (58 static entries);
- synthetic evaluation: Recall@K `0.8333`, MRR `0.8333`, citation precision `1.0`, no-answer correctness `1.0`, tenant leakage `0`;
- scoped Prettier, `git diff --check`, secret/security scans.

## Известные ограничения

- production S3 и external document-processing queue providers, distributed supervision и Docker-enabled CI gate не входят в TASK-004;
- rate limit, budget ledger и operational event sink являются process-local contracts; распределённая реализация требует инфраструктурной задачи;
- variable-dimension vectors используют tenant/model B-tree indexes без ANN index; индекс выбирается после production volume/load measurements;
- page range остаётся nullable, пока upstream extractor не сохраняет точную page provenance;
- evaluation dataset синтетический и должен быть дополнен разрешённой human-labeled выборкой;
- текущий scope индексирует document chunks; статьи и единая knowledge permission model остаются дальнейшей работой.

## Рекомендации для TASK-005

- production deployment/backup/restore для PostgreSQL, S3 и workers;
- external document queue, heartbeat/fencing и production metrics/alerts;
- distributed rate limit и долговечный cost ledger;
- production-scale pgvector load test и выбор HNSW/IVFFlat strategy;
- page provenance и расширение разрешённых knowledge sources;
- human-labeled relevance evaluation и quality thresholds.

## Связанные документы

- [Vision](../VISION.md)
- [Master Specification](../MASTER_SPECIFICATION.md)
- [Architecture 2.0](../ARCHITECTURE_2_0.md)
- [Architecture Decisions](../DECISIONS.md)
- [AI Gateway](../AI_GATEWAY.md)
- [Hybrid RAG](../HYBRID_RAG.md)
- [Document Intelligence](../DOCUMENT_INTELLIGENCE.md)
- [Document Processing](../DOCUMENT_PROCESSING.md)
- [Document Operations](../DOCUMENT_OPERATIONS.md)
- [Product Backlog](../PRODUCT_BACKLOG.md)
- [Project Status](../PROJECT_STATUS.md)
- [Roadmap](../ROADMAP.md)
- [TASK-003](./TASK-003.md)
