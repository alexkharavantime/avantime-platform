# Document Operations

Документ описывает безопасный local/integration запуск Document Storage и Document Processing, а также TASK-005 operational commands. Production topology, deployment, backup/DR и monitoring подробно вынесены в отдельные runbooks.

## Предварительные условия

- Node.js 20+ и зависимости репозитория установлены;
- Docker с поддержкой Compose доступен;
- рабочая директория — корень репозитория;
- integration credentials используются только локально.

Подготовить локальный env:

```bash
cp .env.integration.example .env.integration
```

`.env.integration` исключён из Git. Guard требует `RUN_DOCUMENT_INTEGRATION_TESTS=1`, `NODE_ENV` не равный `production`, локальные PostgreSQL/MinIO endpoints, database и bucket с маркером `integration`, drivers `s3`/`postgresql`/`local`, deterministic fake AI, `pgvector` и PostgreSQL embedding jobs. OCR в обычном integration environment отключён и не требует Tesseract/Poppler.

## Integration infrastructure

Запустить изолированные PostgreSQL 16 с `pgvector`, MinIO и Redis:

```bash
npm run integration:up
```

Compose не запускается автоматически, слушает только loopback-интерфейс и использует отдельные volumes, database и bucket. MinIO bootstrap создаёт bucket идемпотентно и отключает anonymous access.

Проверить конфигурацию и readiness:

```bash
npm run documents:worker-check:integration
npm run documents:health-check:integration
```

Запустить реальные repository, storage, pgvector, embedding worker и RAG end-to-end tests:

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
3. подготавливает legacy fixture и проверяет преобразование статусов, defaults, embedding metadata, `pgvector`, tenant indexes и dimension constraints;
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

Worker требует безопасные `DOCUMENT_WORKER_TENANT_ID` и `DOCUMENT_WORKER_ID`. Production configuration запрещает local queue и требует Redis-backed external adapter с authenticated TLS endpoint.

Для остановки отправить `SIGINT` (`Ctrl+C`) или `SIGTERM`. Worker:

- не получает новый job после сигнала;
- завершает уже выполняющийся `runOnce`;
- прерывает idle polling без ожидания полного интервала;
- не пишет содержимое документа или секреты в лог.

При аварийном завершении lease recovery возвращает просроченный job в обработку с более высоким fencing token. Heartbeat продлевает lease во время OCR/embedding, а critical metadata/completion updates отклоняются после потери lease. Worker version и deployment generation сохраняются для диагностики.

## Health

Route `/api/health/documents` поддерживает:

- `?mode=liveness` — минимальный публичный ответ процесса;
- `?mode=readiness` — минимальный публичный статус Document subsystem;
- `?mode=readiness&details=true` — component statuses только для `ADMIN`.

Readiness проверяет:

- `core`: application/worker configuration, metadata repository, object storage и processing queue;
- `documentIntelligence`: text quality, type detection и отдельный OCR component;
- OCR runtime, выбранные language data и Poppler PDF support без сокрытия `disabled`/`unavailable`.
- `embeddingVector`: provider configuration/availability, vector storage, `pgvector`, dimensions и embedding worker;
- `rag`: configuration, AI Gateway и answer provider.

Overall readiness требует готовый core pipeline. OCR и RAG влияют на него согласно отдельным required-for-readiness policies; production принудительно требует оба настроенных boundaries и отклоняет optional/disabled configuration.

Ответы не содержат connection strings, bucket names, credentials, stack traces и provider messages. Check выполняет только read/list operations и не создаёт probe objects.

Server-side CLI:

```bash
npm run documents:health-check
```

## Embedding, vector и RAG operations

```bash
npm run documents:embedding-check
npm run documents:vector-check
npm run documents:rag-health-check
npm run documents:rag-evaluate
npm run test:rag-integration
```

Для проверки integration PostgreSQL/pgvector используются явные варианты:

```bash
npm run documents:embedding-check:integration
npm run documents:vector-check:integration
```

Embedding worker запускается явно:

```bash
npm run documents:embedding-worker
```

Single-document reindex является dry-run по умолчанию:

```bash
npm run documents:reindex -- --document-id=<id> --dry-run
npm run documents:reindex -- --document-id=<id> --execute
```

Execute против production/remote database блокируется без отдельных `ALLOW_*` flags. Команда не поддерживает массовый reindex и не выводит document content или vectors.

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

## TASK-005 production operations

```bash
npm run production:config-check
npm run production:readiness
npm run queue:health-check
npm run workers:heartbeat-check
npm run ai:cost-report -- --days=30
npm run ai:budget-check
npm run backup:dry-run
npm run backup:status
npm run restore:rehearsal:integration
npm run pgvector:load-test -- --integration --smoke
```

Concrete managed providers, capacity, owners and SLO evidence remain environment
decisions. Application contracts, Redis adapter, fencing, backup/restore guards,
telemetry, ledger and reference deployment are implemented by TASK-005.

Локальный OCR завершённой TASK-003 проверяется отдельными `documents:ocr-check`, `test:ocr-integration` и воспроизводимым `test:ocr-integration:docker`; real OCR test не входит в обычные unit или PostgreSQL/MinIO integration tests.

## Связанные документы

- [Document Processing](./DOCUMENT_PROCESSING.md)
- [Document Intelligence](./DOCUMENT_INTELLIGENCE.md)
- [AI Gateway](./AI_GATEWAY.md)
- [Hybrid RAG](./HYBRID_RAG.md)
- [TASK-002](./tasks/TASK-002.md)
- [TASK-003](./tasks/TASK-003.md)
- [TASK-004](./tasks/TASK-004.md)
- [TASK-005](./tasks/TASK-005.md)
- [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
- [Queue Operations](./QUEUE_OPERATIONS.md)
- [Backup and Restore](./BACKUP_RESTORE.md)
- [Disaster Recovery](./DISASTER_RECOVERY.md)
