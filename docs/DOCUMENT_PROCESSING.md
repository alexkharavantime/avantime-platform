# Обработка документов

Документ описывает третью итерацию TASK-002: tenant-aware очередь, отдельный worker, retries и quarantine для PDF. OCR, embeddings, hybrid RAG и внешний queue provider в эту итерацию не входят.

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

`ExternalDocumentProcessingQueue` является production-контрактом. Конкретный провайдер, инфраструктура и adapter пока не выбраны. Production запрещает local queue и завершается понятной ошибкой без external adapter.

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

При частичной записи производные объекты удаляются, а документ не получает статус `COMPLETED`. Если worker остановился после claim, lease позволяет следующему запуску безопасно восстановить job. Повторный job для уже терминального документа подтверждается без повторной обработки.

Worker пишет в stdout только status, document/job identifiers и безопасный error code. Содержимое документов, секреты, provider messages и stack traces не логируются.

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

- внешний queue provider и distributed adapter не выбраны;
- local queue не предназначена для нескольких процессов или узлов;
- production auto-start, health checks, metrics и alerts не реализованы;
- реальные PostgreSQL/S3/queue integration tests требуют отдельной инфраструктуры;
- обработка ограничена PDF и существующим extractor;
- OCR, embeddings, `pgvector`, semantic/hybrid RAG и AI Gateway не менялись;
- Document API остаётся `ADMIN`-only;
- worker обрабатывает один явно настроенный tenant за процесс.

## Связанные документы

- [TASK-002](./tasks/TASK-002.md)
- [Architecture 2.0](./ARCHITECTURE_2_0.md)
- [Architecture Decisions](./DECISIONS.md)
- [Project Status](./PROJECT_STATUS.md)
- [Product Backlog](./PRODUCT_BACKLOG.md)
- [Roadmap](./ROADMAP.md)
