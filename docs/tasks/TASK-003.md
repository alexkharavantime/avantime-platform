# TASK-003. Document Intelligence и OCR

## Статус

Done

## Ветка

`feature/task-003-document-intelligence`

## Цель

Добавить безопасное определение фактического формата и типа документа, оценку качества извлечённого текста и локальный OCR fallback поверх tenant-aware pipeline TASK-002.

## Контекст

TASK-002 завершила границы storage, metadata repository, queue/worker, retry/quarantine и PostgreSQL/MinIO validation. До этой итерации worker извлекал только текст PDF и не различал текстовый PDF, скан и изображение.

## Scope первой итерации

- PDF, PNG и JPEG с server-side signature detection;
- typed metadata Document Intelligence и безопасная Prisma migration;
- детерминированное определение типа документа без AI;
- централизованная оценка качества и нормализация текста;
- provider-neutral OCR contracts и локальный Tesseract/Poppler adapter;
- OCR fallback в существующем worker lifecycle;
- ADMIN-only reprocess одного документа и dry-run;
- readiness, unit и отдельные OCR integration checks;
- минимальное отображение intelligence metadata в Knowledge Center;
- эксплуатационная и архитектурная документация.

## Out of scope

- embeddings, vector storage, semantic/hybrid retrieval и citations — перенесены в [TASK-004](./TASK-004.md);
- RAG/AI Gateway, OpenAI/Gemini classification — перенесены в [TASK-004](./TASK-004.md);
- S3/queue provider changes, OCR cloud provider;
- Word/Excel processing, mass reprocess, OCR UI editor;
- расширение RBAC, объединение `/portal` и `/dashboard`, публичный UI.

## Требования безопасности

- tenant берётся только из server-side session/worker configuration;
- маршруты не принимают `companyId` клиента;
- checksum проверяется storage adapter до извлечения и OCR;
- MIME определяется по сигнатуре, а клиентские MIME/расширение считаются подсказкой;
- OCR запускается без shell, с allowlist языков, лимитами размера/страниц и timeout;
- временные файлы имеют случайный каталог и удаляются в `finally`;
- содержимое документа, stdout/stderr OCR, пути и секреты не журналируются;
- unsupported/permanent errors не создают бесконечные retry;
- производная не переводит документ в `COMPLETED` до атомарного завершения pipeline.

## Критерии готовности

- [x] Добавлены typed intelligence metadata и безопасная migration.
- [x] Добавлены format/type detection, text quality и normalization services.
- [x] Добавлены OCR contracts и локальный Tesseract/Poppler adapter.
- [x] Worker использует OCR fallback без изменения tenant boundary.
- [x] Добавлен ADMIN-only single-document reprocess с dry-run.
- [x] Пройдены unit tests и production build.
- [x] Повторно пройдены TASK-002 integration checks после добавления migration.
- [x] Фактически пройдён отдельный OCR integration check в окружении с Tesseract/Poppler.
- [x] Обновлена связанная документация и завершена security review кода первой итерации.

## План реализации

1. Расширить metadata и migration с безопасными legacy defaults.
2. Ввести contracts detection, quality, normalization и OCR.
3. Подключить orchestration к worker после checksum verification.
4. Добавить reprocess, health и минимальное отображение metadata.
5. Добавить unit/integration regression tests.
6. Выполнить migration rehearsal, TASK-002 regression и OCR validation.
7. Передать следующий этап embeddings/hybrid RAG в TASK-004.

## Риски

- качество OCR зависит от установленных language packs и качества изображения;
- Tesseract требует Poppler для PDF rasterization;
- синхронная обработка одной job ограничивает throughput;
- rule-based type detection намеренно допускает `UNKNOWN` и manual review;
- OCR-текст содержит те же чувствительные данные, что исходный документ;
- OCR integration требует отдельно подготовленный runtime; воспроизводимый gate запускается в Docker.

## Результат выполнения

Реализованы domain contracts, metadata/migration, основной worker pipeline, ADMIN reprocess, раздельные core/OCR readiness components, Knowledge Center metadata, unit и отдельные integration boundaries. `typecheck`, `lint`, 73 unit tests, Prisma migration deploy, production build и `git diff --check` прошли.

PostgreSQL/MinIO/local queue regression suite прошёл: 16 из 16 integration tests, отдельные document health и worker checks вернули `ready`. Воспроизводимый Docker OCR gate также прошёл: image с Tesseract, Poppler и language packs обработал валидный синтетический PNG, 1 из 1 real OCR test.

Production readiness не ослаблен: production требует явно настроенный OCR provider, запрещает `disabled`/optional OCR и включает OCR runtime в overall readiness. Core document processing и OCR/Document Intelligence readiness разделены, поэтому обычный PostgreSQL/MinIO integration environment проверяет core pipeline без обязательного OCR container и при этом не скрывает состояние OCR component.

Исходный scope и все критерии готовности TASK-003 выполнены. AI Gateway, embeddings, vector storage, semantic/hybrid RAG, citations и evaluation оформлены отдельным [TASK-004](./TASK-004.md).

## Известные ограничения

- Document API остаётся только `ADMIN`;
- загрузка job и OCR выполняются worker последовательно;
- поиск остаётся лексическим;
- Word/Excel только распознаются как неподдерживаемые;
- локальный OCR требует внешние Tesseract и Poppler, бинарные файлы в Git не добавляются.

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
- [Document Operations](../DOCUMENT_OPERATIONS.md)
- [TASK-002](./TASK-002.md)
- [TASK-004](./TASK-004.md)
