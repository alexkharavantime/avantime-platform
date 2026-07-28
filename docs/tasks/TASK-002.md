# TASK-002. Tenant-aware хранение и обработка документов

## Статус

In Progress

## Ветка

`feature/task-002-infrastructure-validation`

## Цель

Поэтапно подготовить безопасную tenant-aware архитектуру хранения и обработки документов: от локальных абстракций до production persistence, сохраняя пользовательское поведение Knowledge Center.

## Контекст

В PR #1 Document API был временно ограничен ролью `ADMIN`, но метаданные, оригиналы, извлечённый текст, chunks и история вопросов продолжили храниться в общих локальных файлах `.data`. API-маршруты напрямую работали с JSON и файловой системой, поэтому принадлежность документа компании не являлась обязательной частью доменной модели.

Первая итерация TASK-002 создаёт tenant-aware границы внутри существующего модульного монолита. Локальная файловая система остаётся development-реализацией, но доступ к ней выполняется только через адаптер и репозитории.

Вторая итерация добавляет PostgreSQL-репозиторий метаданных, S3-compatible storage, soft delete и управляемую миграцию legacy-данных. Она не делает весь Document/RAG production-ready: реальная инфраструктурная интеграция, очередь, OCR, embeddings, полный RBAC, backup и эксплуатационная проверка остаются отдельными этапами.

Третья итерация выносит PDF extraction из upload HTTP request в отдельный tenant-aware processing flow. Она добавляет статусную модель, queue/worker contracts, development local queue, retries и quarantine, но не выбирает и не подключает production queue provider.

Четвёртая итерация проверяет созданные storage и processing boundaries в изолированном local/integration окружении. Она добавляет PostgreSQL/MinIO integration tests, migration rehearsal, liveness/readiness и operational commands, не меняя production deployment и не выбирая внешний queue provider.

## Scope первой итерации

- определить контракты `DocumentStorage`, `DocumentMetadataRepository` и `DocumentProcessingRepository`;
- реализовать `LocalDocumentStorage`;
- зафиксировать контракт будущего `S3DocumentStorage` без реализации;
- ввести обязательные метаданные `companyId`, `uploadedBy`, `status`, `originalName`, `storedName`, `mimeType`, `size`, `createdAt`, `updatedAt`;
- изолировать метаданные, оригиналы, текст, chunks и историю по tenant-контексту;
- перевести Document API с прямого доступа к JSON и файловой системе на репозитории и Storage Adapter;
- сохранить совместимость ответов API с существующим Knowledge Center;
- сохранить синхронное извлечение текста PDF и лексический поиск;
- добавить отрицательные tenant-security тесты;
- актуализировать архитектурную, статусную и backlog-документацию.

## Out of scope первой итерации

- реализация S3-совместимого хранилища;
- очереди, workers и асинхронная обработка;
- OCR и новые форматы документов;
- embeddings, `pgvector`, семантический или гибридный поиск;
- новый AI Gateway или изменение провайдеров OpenAI/Gemini;
- объединение `/portal` и `/dashboard`;
- расширение текущей модели ролей и разрешений;
- изменение публичного интерфейса или пользовательского поведения Knowledge Center;
- production-миграция локальных данных в PostgreSQL или object storage.

## Scope второй итерации

- реализовать tenant-aware `PostgreSQLDocumentMetadataRepository`;
- добавить Prisma-модель и migration-ready SQL для metadata;
- реализовать `S3DocumentStorage` для приватного S3-compatible bucket;
- хранить SHA-256 checksum оригинала и проверять его при чтении и миграции;
- выбирать local или production adapters через централизованную конфигурацию;
- использовать безопасные development defaults и fail-fast production configuration;
- реализовать soft delete metadata и отдельный cleanup command;
- добавить dry-run и идемпотентный migration script из `.data`;
- сохранить legacy-данные после миграции;
- добавить контрактные тесты persistence, tenant isolation и configuration.

## Out of scope второй итерации

- выбор конкретного S3-провайдера и создание bucket политик средствами Infrastructure as Code;
- signed URLs;
- очередь, workers и асинхронная обработка;
- OCR и дополнительные форматы;
- embeddings, `pgvector`, semantic или hybrid RAG;
- AI Gateway и изменение OpenAI/Gemini;
- объединение `/portal` и `/dashboard`;
- расширение RBAC и клиентский доступ к Document API;
- автоматическое удаление legacy-данных;
- production backup/restore и disaster recovery rehearsal.

## Scope третьей итерации

- ввести статусы `UPLOADED`, `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `QUARANTINED` и `DELETED`;
- централизовать допустимые status transitions;
- добавить processing attempts, безопасные ошибки, timestamps, retry и worker metadata;
- определить `DocumentProcessingQueue`, `DocumentProcessingWorker` и `DocumentProcessingJob`;
- реализовать persistent `LocalDocumentProcessingQueue` для development и тестов;
- зафиксировать production-контракт `ExternalDocumentProcessingQueue` без выбора провайдера;
- удалить PDF extraction из upload HTTP request;
- реализовать exclusive worker claim, checksum verification и безопасное восстановление lease;
- реализовать централизованные error classification, exponential backoff и retry limit;
- добавить tenant-aware `ADMIN`-only quarantine API;
- добавить worker, process-one и single-document retry commands;
- минимально отобразить новые статусы в существующем Knowledge Center;
- добавить Prisma migration и автоматические lifecycle/security tests;
- синхронизировать архитектурную, статусную и эксплуатационную документацию.

## Out of scope третьей итерации

- выбор или подключение Redis, SQS, RabbitMQ, Kafka либо другого external queue provider;
- Infrastructure as Code, production auto-start, autoscaling и process manager;
- OCR, Word, Excel и другие форматы;
- embeddings, `pgvector`, semantic или hybrid RAG;
- AI Gateway и изменение OpenAI/Gemini;
- объединение `/portal` и `/dashboard`;
- расширение RBAC или клиентский доступ к Document API;
- массовые destructive quarantine actions;
- автоматическое удаление legacy-данных;
- полноценная observability platform, distributed tracing и alerts.

## Scope четвёртой итерации

- добавить отдельный Docker Compose для PostgreSQL и MinIO только для local/integration testing;
- добавить безопасный пример integration environment без production-секретов;
- проверить PostgreSQL repository и S3-compatible storage реальными integration tests;
- проверить полный PDF processing pipeline без внешних AI API;
- автоматизировать migration rehearsal для пустой и legacy test database;
- разделить liveness и readiness Document subsystem;
- добавить безопасные health, worker configuration и cleanup commands;
- обеспечить graceful shutdown worker по `SIGINT` и `SIGTERM`;
- проверить production fail-fast и запрет local storage/local queue;
- задокументировать operational flow и оставшиеся production decisions.

## Out of scope четвёртой итерации

- изменение production deployment или подключение реальных AWS-ресурсов;
- выбор и реализация external production queue provider;
- distributed heartbeat, fencing, autoscaling, metrics, dashboards и alerts;
- destructive production migration или автоматическое удаление legacy-источника;
- OCR, определение типа документа и дополнительные форматы;
- embeddings, vector storage, semantic/hybrid RAG и AI Gateway;
- расширение RBAC, клиентский доступ к Document API или объединение кабинетов;
- изменение публичного UI.

## Требования безопасности

- каждая операция с документом требует явный tenant-контекст;
- метаданные без `companyId` не создаются и не возвращаются как канонические;
- поиск, чтение, скачивание и удаление выполняются только внутри текущего tenant;
- отсутствие tenant-контекста приводит к отказу, а не к глобальному доступу;
- ключи локального хранилища валидируются и не допускают path traversal;
- удаление одного tenant не затрагивает одноимённые ресурсы другого tenant;
- API остаётся ограничен ролью `ADMIN`;
- маршруты не принимают `companyId` клиента как доверенный источник, tenant определяется серверной сессией;
- значения секретов и содержимое документов не выводятся в отчёты или документацию.
- production использует только PostgreSQL metadata и S3 storage и не запускается с local adapters;
- S3 object key имеет формат `documents/{companyId}/{kind}/{key}`;
- bucket не получает публичных ACL или публичных URL от приложения;
- checksum оригинала хранится в metadata и проверяется сервером;
- API soft-delete не удаляет объект немедленно, а cleanup сохраняет metadata при частичном сбое;
- migration поддерживает dry-run, повторный запуск и не удаляет источник.
- статус документа изменяется только через централизованно проверяемые переходы;
- queue job содержит только безопасные внутренние идентификаторы и operational metadata;
- enqueue идемпотентен внутри tenant;
- worker получает tenant только из server-side configuration и не доверяет HTTP payload;
- checksum оригинала проверяется перед extraction;
- provider messages, stack traces, секреты и содержимое документа не возвращаются клиенту и не логируются;
- один job не обрабатывается параллельно двумя local workers;
- production запрещает local queue и работает fail-fast без внешнего adapter;
- quarantine list/retry/resolve/fail остаются `ADMIN`-only и tenant-aware.
- integration commands требуют явного флага, локальных endpoints и имён database/bucket с маркером `integration`;
- integration cleanup ограничен tenant prefix `integration-` и каталогом `.data/integration`;
- migration rehearsal создаёт и удаляет только локальные базы с проверенными integration-именами;
- публичный health response не содержит имён bucket, connection strings, credentials, stack traces и provider errors;
- подробная readiness-диагностика доступна только после существующей `ADMIN`-авторизации;
- worker identifiers и tenant валидируются как безопасные server-side segments;
- test credentials запрещено переносить в production.

## Критерии готовности первой итерации

- [x] Созданы и используются контракты `DocumentStorage`, `DocumentMetadataRepository` и `DocumentProcessingRepository`.
- [x] Реализован tenant-aware `LocalDocumentStorage`.
- [x] Зафиксирован только контракт будущего `S3DocumentStorage`.
- [x] Новые метаданные всегда содержат обязательные tenant-поля.
- [x] Document API не импортирует `node:fs`, не читает JSON и не строит файловые пути.
- [x] Knowledge Center сохраняет текущие маршруты и формат данных.
- [x] Document API по-прежнему доступен только роли `ADMIN`.
- [x] PDF обрабатывается синхронно, поиск остаётся лексическим.
- [x] Добавлены и проходят обязательные tenant-security тесты.
- [x] Успешно выполнены typecheck, lint, tests, build, `git diff --check` и проверка секретов.
- [x] Обновлены связанные проектные документы и результат выполнения.

## План реализации

1. Зафиксировать tenant-контекст, каноническую модель метаданных и storage keys.
2. Создать интерфейсы хранилища и репозиториев.
3. Реализовать локальные tenant-aware адаптеры с безопасными путями.
4. Сделать PDF extractor чистым преобразованием без записи файлов.
5. Перевести upload, item, file, text, search, ask и history routes на новые границы.
6. Добавить тесты изоляции, обязательных метаданных, удаления и path traversal.
7. Провести проверки и синхронизировать документацию.

## План второй итерации

1. Расширить metadata-модель полями checksum и soft delete.
2. Добавить Prisma schema и PostgreSQL repository с tenant-фильтрами.
3. Реализовать S3 adapter с tenant-prefixed keys и checksum.
4. Добавить configuration registry и production fail-fast.
5. Перевести удаление на soft delete и создать отдельный cleanup flow.
6. Добавить dry-run/idempotent migration из local storage.
7. Покрыть новые контракты тестами и обновить документацию.

## План третьей итерации

1. Расширить каноническую metadata-модель и Prisma enum/columns.
2. Ввести централизованный transition validator и conditional repository transition.
3. Определить queue/worker contracts и реализовать persistent local queue.
4. Перевести upload на `UPLOADED` → idempotent enqueue → `QUEUED`.
5. Реализовать worker lifecycle с checksum, exclusive claim и полной записью derivatives.
6. Добавить error classifier, exponential backoff, retry limit и quarantine.
7. Добавить `ADMIN`-only quarantine API и single-document operational commands.
8. Покрыть lifecycle, tenant isolation, concurrency, restart и fail-fast тестами.
9. Обновить эксплуатационную и проектную документацию.

## План четвёртой итерации

1. Поднять воспроизводимый local/integration boundary PostgreSQL + MinIO.
2. Добавить отдельный runner реальных PostgreSQL, MinIO и end-to-end tests.
3. Добавить guarded cleanup и migration rehearsal для двух временных test databases.
4. Реализовать минимальные liveness/readiness checks без раскрытия конфигурации.
5. Сделать worker shutdown управляемым и покрыть его автоматическими тестами.
6. Добавить operational commands и документацию ручного запуска.
7. Выполнить доступные проверки; integration execution считать отдельным обязательным gate.

## Критерии готовности второй итерации

- [x] PostgreSQL repository фильтрует все операции по `companyId`.
- [x] Prisma schema и migration-ready SQL содержат checksum, soft delete, constraints и индексы.
- [x] S3 adapter использует tenant-prefixed keys, private server access и SHA-256 verification.
- [x] Production configuration выбирает PostgreSQL/S3 и fail-fast при неполных env.
- [x] Development configuration сохраняет local adapters.
- [x] API soft-delete не удаляет объект синхронно, cleanup flow повторяем и сохраняет metadata при сбое.
- [x] Migration поддерживает dry-run, idempotency, checksum report и не удаляет `.data`.
- [x] Document API остаётся `ADMIN`-only, а UI/AI/PDF/search поведение не меняется.
- [x] Контрактные тесты и все обязательные проверки проходят успешно.
- [x] Архитектурные, backlog, roadmap и status документы синхронизированы.

## Критерии готовности третьей итерации

- [x] Семь processing statuses типобезопасны и синхронизированы с Prisma.
- [x] Недопустимые status transitions отклоняются централизованно.
- [x] Upload route не импортирует и не вызывает PDF extractor.
- [x] Enqueue идемпотентен, а API возвращает успех только после постановки job.
- [x] Local queue сохраняет job, lease и не требует внешней инфраструктуры.
- [x] Production configuration запрещает local queue и требует external adapter.
- [x] Worker проверяет checksum, сохраняет полные text/chunks и только затем ставит `COMPLETED`.
- [x] Два worker не обрабатывают один local job параллельно.
- [x] Retry выполняется только для временных ошибок и использует exponential backoff.
- [x] После лимита попыток документ получает `QUARANTINED`.
- [x] Quarantine API поддерживает list/retry/resolve/fail и остаётся `ADMIN`-only.
- [x] Добавлены worker, process-one и dry-run retry commands без production auto-start.
- [x] Добавлены обязательные lifecycle, concurrency, tenant и configuration tests.
- [ ] Все финальные проверки третьей итерации завершены успешно; repository-wide Prettier check остаётся красным из-за существующего форматинг-долга вне scope задачи.
- [x] Документация queue/worker lifecycle и ограничений синхронизирована.

## Критерии готовности четвёртой итерации

- [x] Docker Compose изолирует PostgreSQL и MinIO и не изменяет production deployment.
- [x] Обычный `npm test` не требует Docker.
- [x] Реальные PostgreSQL, MinIO и end-to-end integration tests реализованы отдельным runner.
- [x] Migration rehearsal проверяет пустую и legacy test database, повторный deploy, статусы, defaults, индексы и constraint.
- [x] Liveness и readiness разделены; детальная диагностика закрыта `ADMIN`.
- [x] Integration, cleanup и rehearsal commands имеют deny-by-default production/local-target guards.
- [x] Worker завершает текущий job после `SIGINT`/`SIGTERM` и не claim следующую работу.
- [x] Production по-прежнему запрещает local storage и local queue.
- [x] Изменённые файлы проходят статическую, типовую и scoped formatting проверку.
- [ ] PostgreSQL/MinIO integration tests и migration rehearsal фактически выполнены в Docker environment.

## Риски

- существующие локальные записи не содержат tenant-полей и требуют ограниченной совместимой миграции в системный tenant Avantime;
- JSON-репозиторий остаётся development-решением и не гарантирует безопасную конкурентную запись несколькими процессами;
- системный `ADMIN` пока не имеет пользовательского выбора tenant, поэтому текущий Knowledge Center работает в tenant Avantime;
- production external queue adapter и конкретный provider ещё отсутствуют, поэтому production processing нельзя включить до отдельного инфраструктурного решения;
- local queue гарантирует exclusive claim только внутри одного процесса и не подходит для нескольких узлов;
- worker обрабатывает один server-configured tenant за процесс; модель безопасного multi-tenant worker требует отдельного решения;
- lease позволяет восстановление после остановки, но heartbeat/lease extension для долгих PDF пока отсутствуют;
- базовые статусы наблюдаемы через API, но централизованные metrics, dashboards и alerts ещё не реализованы;
- quarantine flow доступен по API/CLI без отдельного сложного административного UI;
- local adapters не подходят для горизонтального масштабирования и production backup;
- migration и repository покрыты контрактными тестами, но не проверены против реальных PostgreSQL и S3 в CI;
- приватность bucket, lifecycle, encryption и backup зависят от ещё не созданной production-инфраструктуры;
- cleanup после физического удаления требует резервной копии для полного восстановления;
- метаданные истории вопросов пока не перенесены в PostgreSQL и остаются объектом storage;
- Docker недоступен в текущей среде Codex, поэтому реальные integration tests и rehearsal требуют ручного запуска или CI;
- integration Compose не является production Infrastructure as Code и использует только local test credentials;
- readiness подтверждает доступность зависимостей, но не заменяет monitoring, SLO, backup/restore и disaster recovery;
- graceful shutdown не реализует distributed heartbeat/fencing и полагается на существующий lease recovery;
- повторная запись S3-объекта использует явно зафиксированную семантику last-write-wins;

## Результат выполнения

Первая итерация выполнена. Document API переведён на tenant-aware storage и repository boundaries, а обязательные метаданные создаются на основании серверного tenant-контекста. Существующее поведение Knowledge Center, синхронная обработка PDF, лексический поиск и ограничение `ADMIN` сохранены.

Добавлены пять автоматических тестов изоляции документов и локального хранилища. `typecheck`, `lint`, 13 тестов, production build с одноразовым `SESSION_SECRET`, `git diff --check` и проверка репозитория на распространённые форматы секретов завершились успешно.

Production-репозиторий метаданных, реализация S3, очередь, OCR, embeddings, AI Gateway, полный RBAC и административный выбор tenant остаются для следующих итераций.

### Вторая итерация

Добавлены `PostgreSQLDocumentMetadataRepository`, Prisma-модель `DocumentMetadata`, migration-ready SQL, `S3DocumentStorage` и централизованная конфигурация adapters. Production configuration выбирает PostgreSQL/S3 и завершается ошибкой без обязательных параметров; development по умолчанию продолжает использовать local adapters.

Metadata получила обязательный SHA-256 checksum и `deletedAt`. Удаление из API стало мягким: обычные get/list не возвращают удалённый документ, а физическое удаление объектов и metadata выполняет отдельная команда cleanup. Частичный сбой cleanup оставляет metadata для повторного запуска и расследования.

Команда миграции поддерживает `--dry-run`, tenant `avantime` по умолчанию, повторный запуск без дублирования, проверку checksum и безопасный отчёт. Исходные `.data` не удаляются. Добавлены контрактные тесты; интеграционная проверка против реальных PostgreSQL/S3 требует отдельного CI-окружения.

Финальные `typecheck`, `lint`, 24 теста, Prisma Client generation, production build, formatting check, `git diff --check`, security/configuration static checks и поиск распространённых форматов секретов завершились успешно.

### Запуск миграции и откат

1. Создать private bucket с закрытым публичным доступом, шифрованием и versioning.
2. Применить Prisma migration и настроить `DOCUMENT_STORAGE_DRIVER=s3` и `DOCUMENT_METADATA_DRIVER=postgresql`.
3. Выполнить `npm run documents:migrate -w @avantime/web -- --dry-run`.
4. Проверить отчёт и выполнить ту же команду без `--dry-run`.
5. Сверить количество metadata и checksum объектов до переключения трафика.

Для отката вернуть drivers на local только в development или до production cutover. После production cutover восстановить PostgreSQL и bucket из backup либо удалить перенесённые записи и объекты по migration report. Legacy `.data` остаётся неизменной и служит источником повторной миграции. Автоматического destructive rollback нет.

Soft-deleted записи проверяются командой `npm run documents:cleanup -w @avantime/web -- --dry-run`. Запуск без `--dry-run` физически удаляет объекты и затем metadata; до него запись можно восстановить через управляемое изменение `deletedAt`. После cleanup восстановление возможно только из backup.

### Третья итерация

Upload flow сохраняет PDF и metadata со статусом `UPLOADED`, идемпотентно ставит job в queue и возвращает `202` после перехода в `QUEUED`. PDF extractor больше не вызывается внутри HTTP request.

Добавлены queue/worker contracts, persistent `LocalDocumentProcessingQueue`, conditional status transitions, retries с exponential backoff и quarantine после лимита попыток. Worker эксклюзивно получает job, восстанавливает tenant из server-side configuration, проверяет SHA-256, сохраняет text/chunks и только затем переводит документ в `COMPLETED`.

Quarantine API остаётся `ADMIN`-only и позволяет перечислить, повторно поставить, разрешить при полном результате или окончательно остановить один документ. Добавлены команды worker, process-one и retry с `--dry-run`. External provider и production auto-start намеренно не выбраны.

Добавлена Prisma migration статусной и processing metadata-модели. Автоматические тесты покрывают отсутствие synchronous extraction, idempotent enqueue, exclusive workers, tenant isolation, checksum mismatch, lifecycle, retry, quarantine, invalid transitions, partial derivatives, restart и production fail-fast.

`typecheck`, `lint`, 43 теста, Prisma Client generation, Prisma schema validation, production build, scoped formatting check для новых и основных изменённых файлов, `git diff --check`, static security checks и secret scan завершились успешно. Полный `npx prettier --check .` продолжает находить 97 ранее существовавших неотформатированных файлов вне scope TASK-002; массовое форматирование не выполнялось, чтобы не смешивать несвязанные изменения.

### Четвёртая итерация

Добавлены изолированный Docker Compose для PostgreSQL/MinIO, guarded integration environment, отдельные PostgreSQL, MinIO и end-to-end processing tests, а также cleanup и migration rehearsal commands. Обычный unit test suite не зависит от Docker.

Document subsystem получил публичные минимальные liveness/readiness ответы и `ADMIN`-only детализацию по компонентам. Health checks не возвращают connection strings, bucket names, credentials, stack traces или provider messages. Worker корректно принимает `SIGINT`/`SIGTERM`, завершает уже полученный job и не claim следующую работу.

`typecheck`, `lint`, 51 unit/security test, Prisma Client generation, schema validation, production build, local health/worker checks, scoped formatting, `git diff --check`, security invariants и secret pattern scan завершились успешно. Реальный запуск Docker integration tests и migration rehearsal в текущей среде не выполнен: команда `docker` отсутствует. До их успешного выполнения TASK-002 нельзя переводить в `Done`.

## Completion assessment

| Критерий                                            | Оценка              | Комментарий                                                                          |
| --------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| Tenant-aware storage и repository boundaries        | completed           | Local, PostgreSQL и S3-compatible реализации не доверяют tenant из клиента           |
| Асинхронный processing lifecycle                    | completed           | Queue/worker contracts, retries, quarantine и lease recovery реализованы             |
| Production configuration boundaries                 | completed           | Production local adapters запрещены, обязательная конфигурация проверяется fail-fast |
| Изолированное integration environment               | completed           | Compose, безопасный env example, runner и cleanup добавлены                          |
| Реальные PostgreSQL/MinIO/E2E tests                 | partially completed | Тесты реализованы и типизированы, но не выполнены без Docker                         |
| Migration rehearsal                                 | partially completed | Безопасная автоматизация реализована, фактический Docker-запуск ожидается            |
| Liveness/readiness и worker operations              | completed           | Минимальный endpoint, CLI checks и graceful shutdown покрыты unit tests              |
| Production queue provider и distributed supervision | deferred            | Требуют отдельного инфраструктурного ADR и не входят в TASK-002                      |
| Backup/restore, SLO, metrics и alerts               | deferred            | Остаются INFRA-001/INFRA-002                                                         |
| OCR, embeddings и hybrid RAG                        | deferred            | Перенесены в [TASK-003](./TASK-003.md)                                               |

Итог: исходные архитектурные и кодовые границы TASK-002 реализованы, но задание остаётся `In Progress` до фактического успешного прогона PostgreSQL/MinIO integration tests и migration rehearsal.

## Связанные документы

- [AGENTS.md](../../AGENTS.md)
- [Codex Rules](../CODEX_RULES.md)
- [Codex Workflow](../CODEX_WORKFLOW.md)
- [Vision](../VISION.md)
- [Master Specification](../MASTER_SPECIFICATION.md)
- [Architecture 2.0](../ARCHITECTURE_2_0.md)
- [Architecture Decisions](../DECISIONS.md)
- [Roadmap](../ROADMAP.md)
- [Product Backlog](../PRODUCT_BACKLOG.md)
- [Project Status](../PROJECT_STATUS.md)
- [Document Processing](../DOCUMENT_PROCESSING.md)
- [Document Operations](../DOCUMENT_OPERATIONS.md)
- [TASK-001](./TASK-001.md)
- [TASK-003](./TASK-003.md)
