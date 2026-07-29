# Обработка документов

Документ описывает tenant-aware очередь, отдельный worker, retries, quarantine и инфраструктурную валидацию pipeline TASK-002/TASK-003. TASK-004 добавляет отдельный embedding lifecycle после успешного сохранения chunks, не смешивая его с processing status. TASK-005 добавляет Redis production queues, heartbeat и fencing.

## Статусная модель

Канонические статусы хранятся в metadata и PostgreSQL enum:

| Статус        | Значение                                                              |
| ------------- | --------------------------------------------------------------------- |
| `UPLOADED`    | Оригинал и metadata сохранены                                         |
| `QUEUED`      | Идемпотентный job доступен или ожидает `nextRetryAt`                  |
| `PROCESSING`  | Job эксклюзивно получен worker                                        |
| `COMPLETED`   | Text и chunks полностью сохранены                                     |
| `FAILED`      | Обнаружена постоянная ошибка или администратор прекратил обработку    |
| `QUARANTINED` | Исчерпан лимит временных попыток или требуется разбор администратором |
| `DELETED`     | Metadata удалена мягко и ожидает либо прошла cleanup                  |

Переходы проверяет единый модуль `document-processing-state.ts`. Repository выполняет условный переход только внутри переданного tenant. Обычный metadata update не может изменить статус.

## Queue abstraction

`DocumentProcessingQueue` определяет tenant-scoped операции:

- идемпотентный `enqueue`;
- эксклюзивный `claim` с lease;
- `acknowledge` после терминального результата;
- `release` с новым `availableAt` для retry;
- удаление job одного документа;
- диагностический список job текущего tenant.

Job содержит только внутренние идентификаторы документа и job, timestamps и счётчик попыток. Он не содержит файл, извлечённый текст, пользовательский payload или секреты. `companyId` не принимается из HTTP query, body или form: API получает tenant из серверной сессии, а CLI worker — из server-side environment.

`LocalDocumentProcessingQueue` хранит очередь в `.data/document-tenants/{companyId}/processing-queue.json`. Она предназначена только для development и тестов, сохраняет job между перезапусками и восстанавливает просроченный lease. Для неё разрешён только один локальный процесс worker; межпроцессная распределённая блокировка не гарантируется.

`ExternalDocumentProcessingQueue` является production-контрактом. TASK-005 реализует Redis adapter с atomic server-time lease, renewal, fencing, delayed retry и crash recovery. Production запрещает local queue и требует authenticated TLS Redis configuration.

## Upload lifecycle

1. Document API проверяет сессию `ADMIN`, тип и размер PDF.
2. Оригинал сохраняется через `DocumentStorage`.
3. Metadata создаётся со статусом `UPLOADED` и server-derived tenant.
4. Job идемпотентно ставится в очередь.
5. Metadata условно переводится в `QUEUED`.
6. API возвращает `202` только после успешного сохранения и enqueue.

PDF extractor не вызывается внутри upload HTTP request. Если enqueue не выполнен, metadata переводится в `FAILED` с безопасным кодом `QUEUE_ENQUEUE_FAILED`, а клиент получает обобщённую ошибку без provider details или stack trace.

## Worker lifecycle

Worker запускается отдельным процессом и обрабатывает один server-configured tenant:

1. эксклюзивно получает доступный job;
2. условно переводит `QUEUED` или восстановленный `PROCESSING` в `PROCESSING`;
3. сохраняет `workerId`, `processingStartedAt` и увеличивает `processingAttempts`;
4. читает оригинал через `DocumentStorage` с обязательной проверкой SHA-256;
5. вызывает существующий PDF extractor;
6. сохраняет text и chunks через `DocumentProcessingRepository`;
7. только после полного сохранения переводит metadata в `COMPLETED`;
8. подтверждает job в очереди.

После `COMPLETED` worker идемпотентно ставит отдельный embedding job. Ошибка enqueue/indexing не откатывает уже корректный core processing result: она отражается в `embeddingStatus` и отдельных embedding/vector readiness diagnostics.

При частичной записи производные объекты удаляются, а документ не получает статус `COMPLETED`. Если worker остановился после claim, lease позволяет следующему запуску безопасно восстановить job. Повторный job для уже терминального документа подтверждается без повторной обработки.

Worker пишет в stdout только status, document/job identifiers и безопасный error code. Содержимое документов, секреты, provider messages и stack traces не логируются. Heartbeat обновляет lease долгой операции; critical metadata/completion updates проверяют fencing token, worker identity и lease.

`SIGINT` и `SIGTERM` переводят worker в graceful shutdown: текущий `runOnce` завершается, новый job не claim, а idle polling прерывается сразу. Аварийно оставленный lease восстанавливается существующим lease recovery. Distributed heartbeat и fencing не реализованы.

## Retry policy

Ошибка классифицируется отдельно от worker:

- checksum mismatch, отсутствующий оригинал и заведомо некорректный документ считаются постоянными;
- timeout, временная недоступность сети/storage, HTTP 429 и 5xx считаются временными;
- неизвестная внутренняя ошибка повторяется только до установленного лимита.

Для временных ошибок применяется exponential backoff:

`delay = min(initialDelay × 2^(attempts - 1), maxDelay)`.

После временной ошибки документ возвращается в `QUEUED`, получает `nextRetryAt`, безопасные `lastErrorCode`/`lastErrorMessage` и освобождённый job. При достижении `maxAttempts` документ переводится в `QUARANTINED`. Постоянная ошибка сразу переводит его в `FAILED`.

Development defaults:

- `maxAttempts`: 3;
- initial delay: 1 секунда;
- maximum delay: 60 секунд;
- lease: 5 минут;
- poll interval: 1 секунда.

## Quarantine flow

Маршрут `/api/documents/quarantine` остаётся `ADMIN`-only и tenant-aware:

- `GET` возвращает quarantined документы текущего tenant;
- `POST` с `action=retry` идемпотентно ставит один документ в очередь;
- `action=resolve` разрешён только при наличии полного text/chunks результата;
- `action=fail` помечает один документ как permanently failed.

Массовые destructive actions не добавлены. API не принимает `companyId`.

## Команды

Запуск локального worker до безопасной остановки `SIGINT` или `SIGTERM`:

```bash
npm run documents:worker -w @avantime/web
```

Обработка одного доступного job:

```bash
npm run documents:process-one -w @avantime/web
```

Проверка или повторная постановка одного `FAILED`/`QUARANTINED` документа:

```bash
npm run documents:retry -w @avantime/web -- --document-id=<document-id> --dry-run
npm run documents:retry -w @avantime/web -- --document-id=<document-id>
```

Worker не запускается автоматически в production. Решение о process manager, health checks, autoscaling и external queue принимается отдельно.

Integration infrastructure, migration rehearsal, health checks и безопасная очистка описаны в [Document Operations](./DOCUMENT_OPERATIONS.md). Реальные PostgreSQL/MinIO tests запускаются отдельно:

```bash
npm run integration:up
npm run test:integration
npm run documents:migration-rehearsal
npm run documents:health-check:integration
npm run integration:down
```

Обычный `npm test` не требует Docker.

Embedding worker запускается отдельно:

```bash
npm run documents:embedding-worker
npm run documents:embedding-process-one
```

Он использует собственные PostgreSQL/local job contracts, lease, retry/backoff и quarantine. Подробности retrieval, vector lifecycle и reindex описаны в [Hybrid RAG](./HYBRID_RAG.md).

## Health model

`/api/health/documents?mode=liveness` сообщает только о доступности процесса. Readiness отдельно показывает:

- core document processing;
- Document Intelligence/OCR;
- embedding provider/vector repository/worker;
- RAG configuration/AI Gateway/answer provider.

OCR или RAG могут быть optional/disabled вне production: состояние остаётся видимым, но не понижает готовый core. Production принудительно требует настроенные OCR и RAG boundaries. Публичный ответ минимален; component statuses с `details=true` доступны только `ADMIN`.

Health не создаёт probe objects и не возвращает bucket names, credentials, connection strings, stack traces или provider errors.

## Object rewrite policy

Повторная запись одного S3 object key имеет определённое поведение **last-write-wins**. Новый payload заменяет предыдущий. Версионирование документов должно использовать новые immutable keys, а не полагаться на историю перезаписи bucket.

## Конфигурация

| Переменная                             | Назначение                                        |
| -------------------------------------- | ------------------------------------------------- |
| `DOCUMENT_PROCESSING_QUEUE_DRIVER`     | `local` в development или `external` в production |
| `DOCUMENT_PROCESSING_QUEUE_NAME`       | Обязательное имя внешней production-очереди       |
| `DOCUMENT_PROCESSING_MAX_ATTEMPTS`     | Максимальное число попыток                        |
| `DOCUMENT_PROCESSING_INITIAL_RETRY_MS` | Начальная задержка retry                          |
| `DOCUMENT_PROCESSING_MAX_RETRY_MS`     | Максимальная задержка retry                       |
| `DOCUMENT_PROCESSING_LEASE_MS`         | Срок эксклюзивного claim                          |
| `DOCUMENT_PROCESSING_POLL_MS`          | Интервал опроса локальной очереди                 |
| `DOCUMENT_WORKER_TENANT_ID`            | Server-controlled tenant worker                   |
| `DOCUMENT_WORKER_ID`                   | Уникальный безопасный идентификатор worker        |

Production требует PostgreSQL metadata, S3 storage, external queue configuration, явные tenant/worker identifiers и фактический external adapter. Значения секретов в документации и логах не отображаются.

## Ограничения

- конкретный managed Redis provider выбирается в deployment environment;
- local queue не предназначена для нескольких процессов или узлов;
- production auto-start/process manager остаётся обязанностью deployment platform;
- PostgreSQL/MinIO integration tests реализованы, но требуют отдельного Docker-запуска;
- обработка ограничена PDF и существующим extractor;
- OCR fallback для PDF/PNG/JPEG, TASK-004 embedding/pgvector/hybrid RAG lifecycle и TASK-005 page provenance реализованы; legacy/unsupported provenance может быть nullable;
- Document API остаётся `ADMIN`-only;
- worker обрабатывает один явно настроенный tenant за процесс.

## Связанные документы

- [TASK-002](./tasks/TASK-002.md)
- [TASK-003](./tasks/TASK-003.md)
- [TASK-004](./tasks/TASK-004.md)
- [TASK-005](./tasks/TASK-005.md)
- [Queue Operations](./QUEUE_OPERATIONS.md)
- [Document Operations](./DOCUMENT_OPERATIONS.md)
- [Document Intelligence](./DOCUMENT_INTELLIGENCE.md)
- [AI Gateway](./AI_GATEWAY.md)
- [Hybrid RAG](./HYBRID_RAG.md)
- [Architecture 2.0](./ARCHITECTURE_2_0.md)
- [Architecture Decisions](./DECISIONS.md)
- [Project Status](./PROJECT_STATUS.md)
- [Product Backlog](./PRODUCT_BACKLOG.md)
- [Roadmap](./ROADMAP.md)
