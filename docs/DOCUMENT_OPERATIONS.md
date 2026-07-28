# Document Operations

Документ описывает безопасный local/integration запуск Document Storage и Document Processing. Это не production deployment guide: конкретные production PostgreSQL/S3 providers, external queue, process manager, backup и observability ещё не выбраны.

## Предварительные условия

- Node.js 20+ и зависимости репозитория установлены;
- Docker с поддержкой Compose доступен;
- рабочая директория — корень репозитория;
- integration credentials используются только локально.

Подготовить локальный env:

```bash
cp .env.integration.example .env.integration
```

`.env.integration` исключён из Git. Guard требует `RUN_DOCUMENT_INTEGRATION_TESTS=1`, `NODE_ENV` не равный `production`, локальные PostgreSQL/MinIO endpoints, database и bucket с маркером `integration`, а также drivers `s3`, `postgresql` и `local`. OCR в обычном integration environment отключён и не требует Tesseract/Poppler.

## Integration infrastructure

Запустить изолированные PostgreSQL 16 и MinIO:

```bash
npm run integration:up
```

Compose не запускается автоматически, слушает только loopback-интерфейс и использует отдельные volumes, database и bucket. MinIO bootstrap создаёт bucket идемпотентно и отключает anonymous access.

Проверить конфигурацию и readiness:

```bash
npm run documents:worker-check:integration
npm run documents:health-check:integration
```

Запустить реальные repository, storage и end-to-end tests:

```bash
npm run test:integration
```

Обычный `npm test` не требует Docker и не включает файлы `*.integration.test.ts`.

## Migration rehearsal

```bash
npm run documents:migration-rehearsal
```

Команда:

1. создаёт две временные локальные базы с суффиксами `_rehearsal_empty` и `_rehearsal_legacy`;
2. применяет миграции к пустой базе дважды;
3. подготавливает legacy fixture и проверяет преобразование статусов, defaults, nullable fields, индексы и constraint;
4. повторно применяет миграции для проверки идемпотентности;
5. удаляет только созданные rehearsal databases.

Имена базы и endpoints проверяются до любой операции. Production target отклоняется. Команда не изменяет основную integration database и не является production migration command.

## Worker

Проверить server-side конфигурацию:

```bash
npm run documents:worker-check
```

Запустить worker:

```bash
npm run documents:worker -w @avantime/web
```

Worker требует безопасные `DOCUMENT_WORKER_TENANT_ID` и `DOCUMENT_WORKER_ID`. Production configuration запрещает local queue и завершается ошибкой до обработки job, если внешний adapter не внедрён.

Для остановки отправить `SIGINT` (`Ctrl+C`) или `SIGTERM`. Worker:

- не получает новый job после сигнала;
- завершает уже выполняющийся `runOnce`;
- прерывает idle polling без ожидания полного интервала;
- не пишет содержимое документа или секреты в лог.

При аварийном завершении существующий lease recovery возвращает просроченный job в обработку. Distributed heartbeat и fencing не реализованы и требуют будущего решения вместе с external queue.

## Health

Route `/api/health/documents` поддерживает:

- `?mode=liveness` — минимальный публичный ответ процесса;
- `?mode=readiness` — минимальный публичный статус Document subsystem;
- `?mode=readiness&details=true` — component statuses только для `ADMIN`.

Readiness проверяет:

- `core`: application/worker configuration, metadata repository, object storage и processing queue;
- `documentIntelligence`: text quality, type detection и отдельный OCR component;
- OCR runtime, выбранные language data и Poppler PDF support без сокрытия `disabled`/`unavailable`.

Overall readiness требует готовый core pipeline. OCR влияет на него только при явной политике `DOCUMENT_OCR_REQUIRED_FOR_READINESS=true`; production принудительно использует эту политику и завершается ошибкой конфигурации при попытке отключить provider или сделать OCR optional.

Ответы не содержат connection strings, bucket names, credentials, stack traces и provider messages. Check выполняет только read/list operations и не создаёт probe objects.

Server-side CLI:

```bash
npm run documents:health-check
```

## Cleanup и остановка

Удалить только integration test data:

```bash
npm run integration:clean
```

Cleanup ограничен metadata tenant prefix `integration-`, S3 prefix `documents/integration-` и каталогом `.data/integration`. Он не удаляет весь bucket и отклоняет путь вне разрешённой директории.

Остановить сервисы и удалить только integration volumes:

```bash
npm run integration:down
```

`integration:down` удаляет данные локального Compose project. Не использовать эти команды с production env или production endpoints.

## Поведение object storage

S3 object key имеет формат `documents/{companyId}/{kind}/{key}`. Межкорпоративное чтение и удаление блокируются формированием ключа из server-side tenant context. Оригинал проверяется по SHA-256.

Повторная запись одного ключа использует семантику **last-write-wins**: новый объект заменяет прежний. Callers должны использовать неизменяемые document identifiers и не повторно использовать ключи между версиями.

## Оставшиеся production decisions

- managed PostgreSQL и S3-compatible provider, encryption, versioning и bucket policy;
- external queue provider и distributed worker supervision;
- process manager, deployment topology, autoscaling и rollout/rollback;
- backup/restore и disaster recovery rehearsal;
- metrics, SLO, dashboards, alerts и централизованные audit logs;
- distributed heartbeat/fencing для долгих jobs.

Локальный OCR завершённой TASK-003 описан в [Document Intelligence](./DOCUMENT_INTELLIGENCE.md). Он проверяется отдельными `documents:ocr-check`, `test:ocr-integration` и воспроизводимым `test:ocr-integration:docker`; real OCR test не входит в обычные unit или PostgreSQL/MinIO integration tests. AI Gateway, embeddings, vector storage, semantic/hybrid RAG и citations перенесены в [TASK-004](tasks/TASK-004.md).
