# Project Status Avantime Platform

Этот документ фиксирует текущее состояние Avantime Platform: готовность направлений и версий, выполненную и активную работу, риски, долг, метрики и ближайшие действия.

`PROJECT_STATUS.md` является главным источником информации о текущем состоянии проекта. Стратегические цели определяются в Vision и Master Specification, порядок развития — в Roadmap, задачи — в Product Backlog, а архитектурные решения — в ADR.

Документ должен обновляться после каждого завершённого значимого этапа разработки, изменения статуса релиза, принятия архитектурного решения или существенного изменения рисков. Проценты готовности являются экспертной оценкой на дату обновления и не заменяют критерии готовности задач и версий.

## Executive Summary

### 🎯 Текущая цель проекта

Проверить завершённую TASK-005 reference architecture на managed staging infrastructure, затем продолжить production identity/RBAC и объединение Knowledge Center.

### 📈 Общий процент готовности

**35%** относительно целевого объёма Version 4.0. Version 2.0 готова ориентировочно на **38%** и пока не соответствует критериям production-релиза.

### ✅ Три главных достижения с прошлого обновления

1. TASK-005 завершена после authoritative dependency review и повторного full gate suite;
2. добавлены Redis queues/fencing, distributed AI limits, EUR cost ledger, audit и page provenance;
3. добавлены backup/restore rehearsal, pgvector strategy, production images/manifests, CI gates и runbooks.

### 🚧 Три главных риска

1. Reference production architecture не заменяет managed staging rollout, provider capacity/PITR и назначение operational owners; Document API остаётся `ADMIN`-only;
2. параллельные `/portal` и `/dashboard`, а также раздельные article/document knowledge models увеличивают архитектурный долг;
3. accepted dependency risks `AR-DEP-2026-001/002` требуют review до 2026-08-12, а initial SLO не подтверждены production-like измерениями.

### ▶️ Три самые важные задачи на следующий этап

1. Развернуть reference topology в managed staging и подтвердить backup/PITR/alerts.
2. Повторить dependency review `AR-DEP-2026-001/002` не позднее 2026-08-12.
3. Продолжить production identity/RBAC и единую knowledge permission model.

---

# Общая информация

| Поле                             | Значение                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| Проект                           | Avantime Platform                                                                         |
| Версия документа                 | 1.14                                                                                      |
| Дата последнего обновления       | 2026-07-29                                                                                |
| Ответственный                    | Владелец продукта и ведущий архитектор Avantime; персональный владелец требует назначения |
| Текущая ветка Git                | `feature/task-005-production-readiness`                                                   |
| Последний commit                 | `d07deb2 feat(ai): add tenant-aware embeddings and hybrid RAG (#9)`                       |
| Последний стабильный релиз       | Version 1.5 по истории проекта; Git tag релиза отсутствует                                |
| Текущая версия разработки        | Version 2.0, подготовка и консолидация                                                    |
| Общий процент готовности проекта | 35% — экспертная оценка относительно целевого объёма Version 4.0                          |

Снимок сделан по рабочему дереву, содержащему незакоммиченные изменения и новые документы. Поэтому наличие файла или прототипа не означает готовность функции к production.

---

# Общий статус проекта

Avantime находится на переходе от демонстрационной платформы Version 1.5 к безопасному модульному ядру Version 2.0. Уже существуют публичный сайт, клиентский портал, административные сценарии, обращения, вложения, управляемые статьи, Jira и Email, а также экспериментальные функции AI и обработки PDF.

Главный текущий результат — сформирована стратегическая и архитектурная основа Version 2.0. Главный технический вызов — консолидировать параллельные реализации `/portal` и `/dashboard`, две базы знаний и несколько независимых AI-маршрутов, одновременно закрыв пробелы авторизации и хранения данных.

## Граница PR #1 и TASK-002

В PR #1 входят публичный сайт и страница Agent+, защищённая оболочка Dashboard, административный прототип Knowledge Center, базовая обработка PDF, организационная изоляция обращений и вложений, общая UI-библиотека, документация и первый набор отрицательных security-тестов. Демонстрационные элементы Dashboard либо ведут к существующим сценариям, либо помечены как «В разработке».

Первая итерация TASK-002 добавляет tenant-aware модель документов, локальный Storage Adapter и репозиторные границы без изменения интерфейса. Production object storage, очередь, OCR, embeddings, AI Gateway, полная RBAC и объединение `/portal` с `/dashboard` не входят в эту итерацию и относятся к последующим задачам Backlog.

Ограничения состояния PR #1 до TASK-002:

- Document API и локальный Knowledge Center доступны только роли `ADMIN`, потому что метаданные документов ещё не содержат `companyId` и владельца;
- документы и история ответов хранятся локально в `.data`, PDF обрабатывается синхронно, а поиск остаётся лексическим без embeddings;
- OpenAI и Gemini вызываются отдельными маршрутами напрямую, без AI Gateway, единой политики провайдеров, rate limiting и централизованного аудита;
- источники Document AI повторно загружаются сервером по идентификаторам, но это ещё не полноценный tenant-aware RAG;
- локальная демонстрационная авторизация включается только явно и всегда отключена в production.

## Первая итерация TASK-002

В ветке `feature/task-002-document-rag` введены обязательные tenant-метаданные документов, контракты `DocumentStorage`, `DocumentMetadataRepository` и `DocumentProcessingRepository`, а также development-реализация `LocalDocumentStorage`. Все Document API-маршруты работают через эти границы и больше не обращаются напрямую к JSON-файлам или файловой системе.

Оригиналы, извлечённый текст, chunks, metadata и история изолированы по `companyId`. Доступ без tenant-контекста отклоняется, ключи локального хранилища защищены от path traversal, а удаление ограничено текущим tenant. Для прежних development-данных предусмотрена совместимая нормализация в системный tenant `avantime`.

На завершении первой итерации API оставался доступен только `ADMIN`, PDF обрабатывался синхронно, поиск оставался лексическим, а S3, очередь, OCR, embeddings и AI Gateway не были реализованы.

## Вторая итерация TASK-002

В ветке `feature/task-002-storage-persistence` добавлены `PostgreSQLDocumentMetadataRepository`, Prisma-модель и SQL migration, `S3DocumentStorage` и централизованный configuration registry. Production defaults допускают только PostgreSQL/S3 и fail-fast при неполной конфигурации; development сохраняет local adapters.

Metadata содержит SHA-256 checksum и `deletedAt`. API выполняет soft delete, а физическое удаление вынесено в отдельную повторяемую cleanup command. Dry-run/idempotent migration переносит legacy metadata и объекты из `.data`, проверяет checksum и не удаляет локальный источник.

Реализация не означает готовность production infrastructure: конкретный S3-провайдер, private bucket policy, encryption, versioning, backup/restore и реальные PostgreSQL/S3 integration tests ещё не выполнены. Document API остаётся `ADMIN`-only; UI, PDF pipeline, lexical search, OpenAI и Gemini не менялись.

## Третья итерация TASK-002

В ветке `feature/task-002-processing-queue` upload flow сохраняет оригинал и metadata со статусом `UPLOADED`, идемпотентно ставит job и возвращает `202` после перехода в `QUEUED`. PDF extractor больше не импортируется и не вызывается route handler.

Добавлены `DocumentProcessingQueue`, `DocumentProcessingWorker` и `DocumentProcessingJob`, persistent `LocalDocumentProcessingQueue`, centralized status transitions, error classification, exponential backoff и quarantine. Worker получает tenant из server-side configuration, эксклюзивно claim job, проверяет checksum, сохраняет text/chunks и только затем ставит `COMPLETED`. Partial derivatives не считаются завершённой обработкой.

Tenant-aware quarantine API позволяет `ADMIN` перечислить, повторно поставить, разрешить при полном результате или окончательно остановить один документ. Worker, process-one и single-document retry доступны как явные CLI commands; production auto-start отсутствует.

External queue provider не выбран. Production запрещает local queue и fail-fast без внедрённого external adapter. Local queue предназначена для одного development worker process; distributed locking, heartbeat, metrics, alerts и реальные PostgreSQL/S3/queue integration tests остаются следующими этапами.

Проверки третьей итерации TASK-002:

- `npm run typecheck` — успешно для четырёх workspace-пакетов;
- `npm run lint` — успешно; database/shared/ui пока используют placeholder lint scripts;
- `npm run test` — успешно, 43 из 43 теста;
- `npm run db:generate` и Prisma schema validation — успешно;
- `npm run build` — успешно с одноразовым `SESSION_SECRET`, 54 из 54 static entries;
- scoped Prettier check для новых и основных изменённых файлов итерации, `git diff --check`, static security checks и secret scan — успешно;
- repository-wide `npx prettier --check .` по-прежнему обнаруживает накопленный форматинг-долг в 97 существующих файлах вне scope TASK-002.

## Четвёртая итерация TASK-002

В ветке `feature/task-002-infrastructure-validation` добавлен отдельный local/integration Compose с PostgreSQL 16 и MinIO, безопасный env example, отдельный integration runner и guarded cleanup. Обычный `npm test` не зависит от Docker.

Реальные tests покрывают PostgreSQL repository, SQL concurrency/constraints, S3-compatible storage через MinIO и полный PDF pipeline через PostgreSQL, MinIO и существующую local queue. Migration rehearsal проверяет пустую и legacy test database, преобразование статусов, defaults, nullable fields, индексы, constraint и повторный deploy.

Document health разделён на минимальные публичные liveness/readiness и `ADMIN`-only component diagnostics без sensitive configuration. Worker по `SIGINT`/`SIGTERM` завершает текущий job, не claim следующий и прерывает idle wait. Production fail-fast и запрет local adapters сохранены.

PostgreSQL/MinIO integration environment фактически запущен. Migration rehearsal успешно проверил пустую и legacy database, повторный deploy, нормализацию `processingAttempts` и сохранение check constraint. Все 16 PostgreSQL/MinIO/end-to-end tests прошли. TASK-002 переведена в `Done`.

[TASK-003](./tasks/TASK-003.md) завершена: добавлены server-side format detection, Document Intelligence metadata, text-quality assessment, normalization, provider-neutral OCR contract, локальный Tesseract/Poppler adapter, single-document reprocess и раздельные core/OCR readiness components. Production readiness не ослаблен: настроенный OCR обязателен для overall readiness, а обычный PostgreSQL/MinIO environment проверяет core pipeline без OCR container. PostgreSQL/MinIO/local queue regression suite и отдельный Docker OCR gate с реальным Tesseract/Poppler фактически пройдены.

[TASK-004](./tasks/TASK-004.md) завершена: добавлены единый AI Gateway, отдельная embedding queue/worker, tenant-aware versioned document chunk embeddings, PostgreSQL/pgvector, lexical/semantic/hybrid retrieval, server-generated citations, safe no-answer/prompt boundary, single-document reindex и synthetic evaluation. Core, OCR, embedding/vector и RAG readiness разделены; production requirements сохранены.

TASK-004 завершает AI-001 для текущих AI routes. Более широкие AI-002/AI-003 provider policies, AI-007 для статей/клиентских ролей, AI-008 для статей, AI-009 production capacity/backup и DOC-002 external processing queue остаются `In Progress`.

[TASK-005](./tasks/TASK-005.md) завершена в application/code/documentation scope:
реализованы Redis queues/fencing, distributed AI limits, PostgreSQL cost/budget
ledger, backup/restore guards, isolated rehearsal, telemetry/audit, page
provenance, load-test/ANN decision, configuration hardening,
containers/manifests, CI gates и runbooks. Authoritative npm audit
классифицирован; `AR-DEP-2026-001/002` приняты до 2026-08-12.

Подтверждены 103/103 unit/security tests, 18/18 full integration,
отдельные production Redis/cost/audit и Hybrid RAG suites, real OCR, migration и
restore rehearsals, health/operations, typecheck, lint, static security gates,
production build на 59 entries и все пять production Docker targets.

Проверки четвёртой итерации TASK-002:

- `npm run typecheck` — успешно для четырёх workspace-пакетов;
- `npm run lint` — успешно; database/shared/ui пока используют placeholder lint scripts;
- `npm run test` — успешно, 52 из 52 tests;
- `npm run db:generate` и Prisma schema validation — успешно;
- production `npm run build` — успешно с одноразовым `SESSION_SECRET`, 55 из 55 static entries;
- PostgreSQL/MinIO/end-to-end integration suite — успешно, 16 из 16 tests;
- migration rehearsal для пустой и legacy database — успешно, repeated deploy идемпотентен;
- integration document health и worker configuration checks — успешно;
- graceful shutdown и production fail-fast — успешно в unit tests;
- scoped Prettier check, `git diff --check`, security invariants и secret pattern scan — успешно;
- legacy `processingAttempts`: `NULL` нормализуется допустимо, отрицательное значение — в `0`, положительное сохраняется; constraint отклоняет новые отрицательные значения.

Проверки второй итерации TASK-002:

- `npm run typecheck` — успешно для четырёх workspace-пакетов;
- `npm run lint` — успешно; database/shared/ui пока используют placeholder lint scripts;
- `npm run test` — успешно, 24 из 24 тестов;
- `npm run db:generate` — Prisma schema валидна, client generation успешно;
- `npm run build` — успешно с одноразовым `SESSION_SECRET`, 53 из 53 static entries;
- formatting, `git diff --check`, configuration/security static checks и поиск распространённых форматов секретов — успешно.

Проверки первой итерации TASK-002:

- `npm run typecheck` — успешно для всех четырёх workspace-пакетов;
- `npm run lint` — успешно; полноценный ESLint настроен для `apps/web`, остальные пакеты пока используют временные lint-скрипты;
- `npm run test` — успешно, 13 из 13 тестов;
- `npm run build` — успешно с одноразовым `SESSION_SECRET`, с сохранением известных предупреждений Turbo/Next.js о build outputs и дополнительном lockfile вне репозитория;
- `git diff --check` и проверка репозитория на распространённые форматы секретов — успешно.

Проверки рабочего дерева PR #1 на 2026-07-27:

- `npm run typecheck` — успешно для всех четырёх workspace-пакетов;
- `npm run lint` — успешно; полноценный ESLint настроен для `apps/web`, а остальные пакеты пока используют временные lint-скрипты;
- `npm run test` — успешно, 8 из 8 security-тестов;
- `npm run build` — успешно при явно переданном одноразовом `SESSION_SECRET`; запуск без секрета ожидаемо остановился с понятной ошибкой. Next.js сгенерировал 53 статические записи; остаются предупреждения о дополнительном lockfile вне репозитория и пустых build outputs TypeScript-only пакетов.

| Направление             | Статус      | Готовность | Комментарий                                                                                                                                            |
| ----------------------- | ----------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Документация            | Review      |        80% | Созданы и добавлены в Git Vision, Master Specification, Architecture 2.0, Roadmap, Product Backlog и ADR; формальное утверждение ещё не завершено      |
| Публичный сайт          | In Progress |        65% | Основные страницы существуют, главная перерабатывается; нет завершённых новостей, вебинаров и мультиязычности                                          |
| Личный кабинет          | In Progress |        65% | Обращения изолированы по компании, dashboard требует сессию; требуется объединение двух оболочек                                                       |
| Административная панель | In Progress |        55% | Есть обращения, знания, Email, события и настройки; нет полного управления пользователями, компаниями и AI                                             |
| AI Platform             | In Progress |        48% | AI Gateway, document embeddings, pgvector, hybrid RAG и durable cost controls готовы; articles, agents и managed provider rollout остаются             |
| База знаний             | In Progress |        45% | Есть управляемые статьи и прототип документов; реализации не объединены                                                                                |
| Интеграции              | In Progress |        25% | Нет Integration Hub, общих очередей и контракта коннекторов                                                                                            |
| Jira                    | In Progress |        35% | Реализовано создание issue; двусторонняя синхронизация отсутствует                                                                                     |
| 1С                      | Planned     |        10% | Есть продуктовая экспертиза и целевая архитектура; production-коннектор не реализован                                                                  |
| Agent+                  | Planned     |        15% | Есть публичная страница и продуктовая концепция; интеграционный модуль не реализован                                                                   |
| API                     | In Progress |        50% | Добавлены ADMIN document search/RAG/indexing/reindex APIs; внешняя версионируемая API Platform отсутствует                                             |
| Безопасность            | In Progress |        65% | Dashboard и внутренние API закрыты; document persistence tenant-aware и проверен локально, но полная RBAC и production provider validation отсутствуют |
| UI/UX                   | In Progress |        50% | Идёт редизайн и перенос компонентов; дизайн-система ещё не стабилизирована                                                                             |
| Инфраструктура          | In Progress |        40% | Добавлены Redis queues, guarded backup/restore, telemetry contracts и reference production topology; managed rollout и PITR ещё не подтверждены        |
| Тестирование            | In Progress |        62% | Проходят 103 unit/security, 18 full integration, отдельные RAG/Redis/OCR, migration/restore и static security gates; advisories классифицированы       |
| Развёртывание           | In Progress |        15% | Добавлены hardened image targets, reference Compose и deployment/rollback runbook; staging rollout и owners ещё не подтверждены                        |

---

# Выполнено

На дату снимка AI-001 завершена в границе текущих AI routes. Статус `Done` не распространяется на production infrastructure, расширенную provider policy, статьи, клиентский RAG или AI Agents.

| ID     | Название          | Версия      | Дата завершения | Краткое описание результата                                                            |
| ------ | ----------------- | ----------- | --------------- | -------------------------------------------------------------------------------------- |
| AI-001 | Единый AI Gateway | Version 2.0 | 2026-07-28      | Общий fake/OpenAI/Gemini boundary, limits, usage events, readiness и безопасные ошибки |

Исторически в проекте реализованы рабочие основы сайта, портала, административной панели, PostgreSQL/Prisma, Jira, Email, вложений и базы знаний. Они учитываются в готовности направлений, но не задним числом объявляются завершёнными задачами нового backlog.

---

# В работе

| ID                | Задача                                               | Приоритет | Готовность | Ожидаемый результат                                                                                                       |
| ----------------- | ---------------------------------------------------- | --------- | ---------: | ------------------------------------------------------------------------------------------------------------------------- |
| WEB-001           | Редизайн главной страницы                            | P1        |        70% | Современная адаптивная главная с рабочими CTA и навигацией                                                                |
| WEB-003           | Каталог решений                                      | P1        |        65% | Масштабируемый каталог на едином шаблоне                                                                                  |
| PORTAL-001        | Единый Dashboard                                     | P0        |        35% | Один защищённый клиентский кабинет вместо параллельных оболочек                                                           |
| PORTAL-002        | Обращения                                            | P0        |        70% | Надёжные обращения, сообщения, статусы, SLA и вложения                                                                    |
| PORTAL-003        | Документы                                            | P0        |        60% | Persistence и async worker contracts готовы; production deployment, external queue и клиентский доступ ещё не реализованы |
| AI-002            | Адаптер OpenAI                                       | P0        |        65% | Adapter готов; streaming и production validation остаются                                                                 |
| AI-003            | Адаптер Gemini                                       | P1        |        60% | Adapter готов; fallback policy и production validation остаются                                                           |
| AI-007            | Защищённый RAG                                       | P0        |        65% | ADMIN document RAG готов; статьи, клиентские роли и единая permission model остаются                                      |
| KB-001            | Объединение двух баз знаний                          | P0        |        30% | Единый домен статей и документов                                                                                          |
| DOC-001           | Единое файловое хранилище                            | P0        |        65% | Local/S3 adapters, PostgreSQL metadata и migration готовы; infrastructure, signed URLs, backup и вложения остаются        |
| DOC-002           | Конвейер обработки документов                        | P0        |        88% | Processing/OCR/embedding workers и indexing готовы; external processing queue и production monitoring остаются            |
| UX-001            | Единая дизайн-система                                | P1        |        45% | Общие tokens и интерфейсные паттерны                                                                                      |
| UX-002            | Библиотека компонентов                               | P1        |        45% | Стабильные exports и повторно используемые компоненты                                                                     |
| DOCS-001–DOCS-004 | Vision, Master Specification, Architecture и Roadmap | P0–P1     |        85% | Утверждённая согласованная документационная основа                                                                        |
| SEC-001           | Авторизация Dashboard                                | P0        |        75% | Закрытые Dashboard и внутренние API с безопасным возвратом после входа и отрицательными тестами                           |
| SEC-002           | RBAC                                                 | P0        |        45% | Tenant-контекст документов добавлен; полная матрица ролей и клиентский доступ остаются                                    |

Проценты в этой таблице являются оценкой текущего фактического объёма, а не изменением статусов Product Backlog.

---

# Следующие задачи

Рекомендуемая последовательность ближайших задач:

| Порядок | ID         | Задача                          | Приоритет | Зависимости                                      |
| ------: | ---------- | ------------------------------- | --------- | ------------------------------------------------ |
|       1 | SEC-001    | Авторизация Dashboard           | P0        | Текущая модель сессий, PORTAL-001                |
|       2 | SEC-002    | RBAC и организационная изоляция | P0        | PostgreSQL, утверждённая матрица ролей           |
|       3 | SEC-005    | Управление секретами            | P0        | Production-инфраструктура и правила конфигурации |
|       4 | INFRA-001  | Production-инфраструктура       | P0        | DOCS-006, SEC-005                                |
|       5 | PORTAL-001 | Единый Dashboard                | P0        | SEC-001, SEC-002, UX-001                         |
|       6 | DOC-001    | Единое файловое хранилище       | P0        | INFRA-001, SEC-005, SEC-006                      |
|       7 | KB-001     | Объединение двух баз знаний     | P0        | DOC-001, SEC-002, AI-007                         |
|       8 | AI-002/003 | Production provider policies    | P0/P1     | SEC-004, SEC-005, готовый AI Gateway             |
|       9 | INFRA-002  | Мониторинг и логирование        | P0        | INFRA-001, SEC-003                               |
|      10 | INFRA-003  | Очереди и фоновые задачи        | P0        | INFRA-001, INFRA-002                             |

Пункты 1–3 формируют обязательный security foundation. После утверждения контрактов задачи 4–7 можно выполнять параллельно разными владельцами. Объединение знаний и фоновые процессы выполняются после фиксации правил доступа, хранения и AI Gateway.

---

# Основные достижения проекта

- создана работающая основа публичного сайта на Next.js App Router;
- реализован клиентский портал с обращениями, сообщениями, вложениями, профилем, командой и уведомлениями;
- создана административная часть для обращений, знаний, Email и системных событий;
- определена Prisma-схема из 11 моделей и PostgreSQL как production-направление;
- реализовано создание Jira issue из обращения;
- создана Email-очередь с Resend и демонстрационным fallback;
- реализована управляемая база статей со статусами и поиском;
- создан прототип загрузки PDF, извлечения текста, поиска и ответов OpenAI;
- PDF upload переведён на отдельный queue/worker flow с retries и quarantine;
- добавлен отдельный прототип Gemini;
- сформированы Vision, Master Specification, Architecture 2.0, Roadmap, Product Backlog и 18 ADR;
- создана feature branch `feature/avantime-platform-v2`;
- локальные runtime-данные и TypeScript build data исключены из Git.

---

# Основные риски

| Категория       | Риск                                                                                                                            | Возможное снижение                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Технический     | Локальные документы имеют tenant-контекст, но системный `ADMIN` пока работает только в tenant `avantime` без выбора организации | Следующая итерация SEC-002 и явная модель административного tenant-доступа |
| Технический     | S3/PostgreSQL contracts проверены через local PostgreSQL/MinIO, но не против выбранных production providers                     | Staging provider validation и backup/restore test                          |
| Технический     | Async PDF worker готов, но production external queue adapter и distributed supervision отсутствуют                              | INFRA-003, provider decision, health checks и queue monitoring             |
| Архитектурный   | `/portal` и `/dashboard` развиваются параллельно                                                                                | Утвердить ADR-0009 и выполнить PORTAL-001                                  |
| Архитектурный   | Существуют две базы знаний                                                                                                      | KB-001, единая модель прав и lifecycle                                     |
| Архитектурный   | AI Gateway limits/events process-local; production provider policies не проверены                                               | Distributed limits/metrics и staging provider validation                   |
| Архитектурный   | Demo fallback может маскировать сбой production-базы                                                                            | Явно разделить demo и production, fail fast в production                   |
| Организационный | 30 задач одновременно отмечены `In Progress`                                                                                    | Ограничить work in progress и назначить владельцев                         |
| Организационный | У документов нет персонально назначенного владельца                                                                             | Назначить владельца продукта и ведущего архитектора                        |
| Организационный | Большой незакоммиченный набор смешивает разные направления                                                                      | Разделить изменения на небольшие логические commits и pull requests        |

---

# Архитектурный долг

## Что требует переработки

- расширение security-тестов за пределы базовых отрицательных сценариев PR #1;
- объединение `/portal` и `/dashboard`;
- объединение управляемых статей и локального Knowledge Center;
- production policies, distributed limits и durable metrics для готового AI Gateway;
- production deployment и эксплуатационная проверка существующего Storage Adapter;
- распространение tenant-контекста на полный RBAC и остальные домены;
- production external queue для документов и фоновые очереди Email/интеграций;
- единый аудит, технические логи и корреляционные идентификаторы.

## Что желательно оптимизировать

- разделение route handlers и доменных сервисов;
- репозиторные границы вокруг Prisma;
- единый формат ошибок и валидации;
- API UI-компонентов и exports `@avantime/ui`;
- конфигурацию workspace-зависимостей;
- production-scale pgvector indexing и relevance tuning;
- согласованность версий документации и package metadata.

## Что можно отложить

- переход к микросервисам;
- Claude и локальные LLM;
- Agent Marketplace;
- полную плагинную платформу;
- мультитенантный self-service;
- международную локализацию;
- сложную координацию нескольких AI-агентов.

---

# Технический долг

## Известные проблемы

- Document API имеет tenant-метаданные, но временно закрыт для всех ролей, кроме `ADMIN`;
- production persistence adapters не проверены против реальных PostgreSQL/S3, а история AI всё ещё хранится как объект;
- прямые маршруты OpenAI и Gemini не объединены общими политиками, rate limiting и аудитом;
- `/portal` и `/dashboard`, а также две реализации базы знаний пока существуют параллельно;
- demo fallback хранилищ при недоступной production-базе требует отдельного fail-fast режима;
- набор тестов закрывает обязательные отрицательные security-сценарии PR #1, но ещё не является полной стратегией тестирования.

## Временные решения

- in-memory fallback при отсутствии PostgreSQL;
- локальное хранение файлов в `.data`;
- JSON-файлы для документов и истории AI;
- local document queue без distributed external adapter;
- rule-based `/api/assistant`;
- односторонняя Jira-интеграция;
- console fallback для Email.

## Необходимые улучшения

- обязательная production-конфигурация и fail-fast validation;
- production object storage, external queue adapter и worker supervision;
- интеграционные, security и contract tests;
- централизованный rate limit;
- health checks и мониторинг;
- двусторонние integration queues;
- проверяемый RAG;
- документированные migration и rollback procedures.

---

# Качество проекта

## Код

**Оценка:** 5/10.

**Комментарий:** стек современный, а доменная функциональность уже значительна, но текущий рабочий набор не проверен целиком, часть файлов сжата в трудно поддерживаемый формат, а границы API, сервисов и данных непоследовательны.

**Рекомендации:** стабилизировать рабочее дерево, завершить перенос UI, внедрить сервисные границы, единые схемы валидации и обязательные проверки CI.

## Документация

**Оценка:** 8/10.

**Комментарий:** создан полный стратегический набор, но значительная часть документов находится в `Review`, не добавлена в Git и ещё не прошла формальное утверждение.

**Рекомендации:** провести совместный review, назначить владельцев, добавить взаимные ссылки и синхронизировать README и version metadata.

## Архитектура

**Оценка:** 6/10.

**Комментарий:** целевая архитектура рациональна и сохраняет модульный монолит, но фактический код содержит параллельные реализации и прямые зависимости от внешних сервисов.

**Рекомендации:** принять Proposed ADR для Version 2.0 и выполнять консолидацию небольшими обратимыми этапами.

## Безопасность

**Оценка:** 4/10.

**Комментарий:** dashboard и внутренние AI/document routes требуют серверную сессию; document API временно ограничен `ADMIN`, а обращения, вложения и document persistence adapters изолированы по `companyId`. Небезопасный `returnTo` отклоняется, отсутствие обязательной production storage configuration приводит к понятной ошибке. Полная ролевая модель и клиентский доступ к документам отсутствуют.

**Рекомендации:** SEC-001, SEC-002, SEC-004 и SEC-005 выполнить до расширения AI и документов.

## Производительность

**Оценка:** 5/10.

**Комментарий:** Next.js и PostgreSQL создают хорошую основу, а PDF вынесен в отдельный worker. Однако нет зафиксированных нагрузочных показателей, external queue, кэша, heartbeat и трассировки.

**Рекомендации:** определить SLO, вынести тяжёлые операции, внедрить метрики и провести базовые нагрузочные тесты.

## Тестирование

**Оценка:** 4/10.

**Комментарий:** 73 unit/security tests проверяют авторизацию, tenant isolation, persistence, lifecycle, retries/quarantine, migration ordering, раздельные core/OCR health guards, graceful shutdown и production fail-fast. Дополнительно 16 PostgreSQL/MinIO/end-to-end integration tests, migration rehearsal и отдельный real OCR Docker test успешно выполнены локально.

**Рекомендации:** начать с auth/RBAC, обращений, документов, RAG permissions, Jira idempotency и migration tests.

---

# Метрики проекта

Метрики зафиксированы по текущему рабочему дереву на 2026-07-28.

| Метрика                          |                      Значение | Метод и пояснение                                                                                    |
| -------------------------------- | ----------------------------: | ---------------------------------------------------------------------------------------------------- |
| Количество документов            |                            25 | 22 Markdown-файла в `docs` плюс `README.md`, `AGENTS.md` и `INSTALL_BIG_SUR.md`                      |
| Количество модулей               |                             4 | Workspace-модули: `apps/web`, `packages/database`, `packages/shared`, `packages/ui`                  |
| Количество страниц               |                            32 | Фактические `page.tsx` в `apps/web/app`, включая существующий публичный маршрут `/knowledge/[slug]`  |
| Количество API                   |                            27 | Фактические `route.ts` в `apps/web/app/api`, включая quarantine и Document health                    |
| Количество AI-компонентов        |          3 основных механизма | rule-based assistant, Gemini route и OpenAI document Q&A; 19 source-файлов содержат AI-связанный код |
| Количество интеграций            | 4 реализованных или частичных | Jira, Resend Email, OpenAI и Gemini; 1С и Agent+ пока не являются production-интеграциями            |
| Количество открытых задач        |                            84 | 50 `Planned`, 30 `In Progress`, 4 `Review`                                                           |
| Количество завершённых задач     |                             0 | В Product Backlog нет статуса `Done`                                                                 |
| Количество ADR                   |                            18 | 11 `Accepted`, 7 `Proposed`                                                                          |
| Количество известных ограничений |                             6 | Явно перечисленные ограничения в разделе «Технический долг»                                          |

---

# Готовность к релизу

| Версия      | Готовность | Основные оставшиеся задачи                                                                                                                |
| ----------- | ---------: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Version 2.0 |        38% | Security foundation, единый портал, production deployment/backup, external queue, provider validation, мониторинг и обязательные CI gates |
| Version 2.1 |        10% | Integration Hub, двусторонняя Jira, production-интеграции 1С и Agent+, кабинет сотрудников и мониторинг обменов                           |
| Version 2.2 |        10% | Knowledge Center 2.0, новые форматы, версии, AI Agents, новости, вебинары, аналитика и User Guide                                         |
| Version 3.0 |         5% | Мультитенантность, SSO/MFA, API Platform, Developer Platform, плагины, Claude, локальные LLM и marketplace                                |

Version 2.0 не готова к production-релизу. Процент отражает наличие функциональной основы и документов, но безопасность, эксплуатация и критерии готовности ещё не выполнены.

---

# Решения, требующие внимания

1. Завершить ADR-0007 production fallback и data-classification policy.
2. Провести production capacity review принятого ADR-0020 (`pgvector`/ANN).
3. Утвердить ADR-0009: целевые маршруты единого клиентского кабинета.
4. Утвердить ADR-0011: границы REST API и локального агента 1С.
5. Утвердить ADR-0013: роли, разрешения и tenant-контекст.
6. Утвердить ADR-0014: базовая ветка и переход к классическому GitHub Flow.
7. Выбрать concrete external queue provider и production adapter для принятого ADR-0017.
8. Выбрать конкретного S3-провайдера и утвердить private bucket policy.
9. Выбрать платформу логирования, traces и мониторинга.
10. Определить production identity: серверные сессии, MFA и SSO roadmap.
11. Назначить персональных владельцев Product Backlog, ADR и Project Status.

---

# Рекомендуемые следующие действия

| Порядок | Действие                                                           | Приоритет | Ожидаемый эффект                                    | Ориентировочная сложность |
| ------: | ------------------------------------------------------------------ | --------- | --------------------------------------------------- | ------------------------- |
|       1 | Завершить review и сохранить стратегические документы отдельным PR | P0        | Единый утверждённый источник требований             | Низкая                    |
|       2 | Утвердить RBAC и правила выбора tenant системным администратором   | P0        | Основа безопасного клиентского доступа к документам | Высокая                   |
|       3 | Развернуть private S3 bucket и PostgreSQL migration environment    | P0        | Проверяемое production-хранение                     | Высокая                   |
|       4 | Провести staging provider validation и backup/restore test         | P0        | Безопасный переход без потери tenant-принадлежности | Средняя                   |
|       5 | Проверить production AI providers и distributed limits             | P0        | Эксплуатационная готовность AI Gateway              | Высокая                   |
|       6 | Объединить `/portal` и `/dashboard` по этапам                      | P0        | Цельный UX и устранение дублирования                | Высокая                   |
|       7 | Развернуть Redis queues и telemetry adapters в managed staging     | P0        | Проверяемая production-обработка и диагностика      | Высокая                   |
|       8 | Расширить security и integration tests критических сценариев       | P0        | Проверяемая готовность Version 2.0                  | Высокая                   |

---

# История обновлений

| Дата       | Версия | Автор                                 | Изменения                                                                                                                                                                                    |
| ---------- | ------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-29 | 1.14   | Codex, по поручению владельца проекта | TASK-005 завершена: authoritative npm audit классифицирован, compatible transitive patch применён, AR-DEP-2026-001/002 приняты до 2026-08-12, full gate suite повторно пройден               |
| 2026-07-29 | 1.13   | Codex, по поручению владельца проекта | После восстановления повторно подтверждены 103 unit/security, integration, OCR, migration/restore, pgvector, build и пять Docker targets; dependency review остаётся blocker                 |
| 2026-07-28 | 1.12   | Codex, по поручению владельца проекта | Зафиксированы TASK-005 production reliability contracts и фактические unit/integration/OCR/migration/restore/security gates; dependency review и повторный final build остаются blockers     |
| 2026-07-28 | 1.10   | Codex, по поручению владельца проекта | TASK-004 завершена: AI Gateway, embeddings, pgvector, hybrid RAG, citations, evaluation и раздельная readiness прошли unit/integration/migration/build gates                                 |
| 2026-07-28 | 1.9    | Codex, по поручению владельца проекта | TASK-003 переведена в Done после успешных core/OCR readiness, PostgreSQL/MinIO и real Tesseract/Poppler gates; AI Gateway, embeddings и hybrid RAG перенесены в TASK-004                     |
| 2026-07-28 | 1.8    | Codex, по поручению владельца проекта | Исправлена нормализация legacy processingAttempts; успешно выполнены migration rehearsal и 16 PostgreSQL/MinIO/E2E tests; TASK-002 переведена в Done                                         |
| 2026-07-28 | 1.7    | Codex, по поручению владельца проекта | Добавлены PostgreSQL/MinIO integration boundary, migration rehearsal, Document health, graceful worker shutdown, operational guide и draft TASK-003; Docker execution gate остаётся открытым |
| 2026-07-27 | 1.6    | Codex, по поручению владельца проекта | Зафиксирована третья итерация TASK-002: queue/worker contracts, async PDF, retries, quarantine, status model и lifecycle tests                                                               |
| 2026-07-27 | 1.5    | Codex, по поручению владельца проекта | Зафиксирована вторая итерация TASK-002: PostgreSQL/S3 persistence, checksum, soft delete, migration/cleanup и контрактные тесты                                                              |
| 2026-07-27 | 1.4    | Codex, по поручению владельца проекта | Зафиксирована первая итерация TASK-002: tenant-aware metadata, локальный Storage Adapter, репозитории Document/RAG и пять новых security-тестов                                              |
| 2026-07-27 | 1.3    | Codex, по поручению владельца проекта | Актуализированы 32 страницы и 25 API-маршрутов; отделён scope PR #1 от TASK-002; зафиксированы ограничения Document/RAG и AI; удалена устаревшая рекомендация о маршруте статьи              |
| 2026-07-27 | 1.2    | Codex, по поручению владельца проекта | Зафиксирован базовый этап защиты Dashboard и внутренних API, организационная изоляция обращений и вложений, результаты lint/typecheck/build и оставшийся риск tenant-модели документов       |
| 2026-07-27 | 1.1    | Codex, по поручению владельца проекта | Добавлен Executive Summary; выполнена полная сверка со стратегией, Roadmap, Product Backlog и ADR; добавлены рекомендации по улучшению                                                       |
| 2026-07-27 | 1.0    | Codex, по поручению владельца проекта | Создан первоначальный официальный снимок состояния проекта                                                                                                                                   |

---

# Инструкция для Codex

При обновлении документа Codex должен:

- перед началом прочитать `AGENTS.md`, `docs/CODEX_RULES.md` и `docs/MASTER_SPECIFICATION.md`;
- обновлять документ после завершения значимых этапов проекта;
- не удалять историю изменений;
- добавлять новую строку в журнал обновлений;
- корректировать процент готовности только на основании реально выполненных задач и подтверждённых проверок;
- синхронизировать информацию с `PRODUCT_BACKLOG.md`, `ROADMAP.md` и `DECISIONS.md`;
- проверять фактические метрики по текущему рабочему дереву;
- отмечать обнаруженные риски, ошибки и архитектурные проблемы;
- не изменять статус задач без достаточных оснований;
- отделять факты от экспертных оценок;
- не объявлять прототип production-готовой функцией;
- указывать текущую ветку, commit и наличие незакоммиченных изменений;
- сохранять терминологию Vision, Master Specification и Architecture 2.0.

---

# Самопроверка

Перед завершением работы самостоятельно проверить:

- документ соответствует `VISION.md`;
- документ соответствует `MASTER_SPECIFICATION.md`;
- документ согласован с `ROADMAP.md`;
- документ согласован с `PRODUCT_BACKLOG.md`;
- документ согласован с `DECISIONS.md`;
- терминология едина во всех документах;
- факты подтверждаются структурой проекта, Git или связанными документами;
- экспертные оценки явно обозначены;
- отсутствуют известные противоречия;
- присутствуют риски, зависимости и дальнейшие решения;
- документ можно использовать как основной источник информации о состоянии проекта.

Результат самопроверки на 2026-07-27:

- стратегические направления соответствуют Vision и Master Specification;
- готовность версий и порядок задач соответствуют Roadmap;
- статусы и количество задач сверены с Product Backlog;
- количество и статусы ADR сверены с Decisions;
- обнаружено одно терминологическое уточнение: в документах смешиваются русские и английские названия `AI Platform`, `Knowledge Center`, `Integration Hub` и `API Platform`; рекомендуется сохранить эти названия как официальные продуктовые термины и добавить глоссарий;
- прямых противоречий в целях версий не обнаружено;
- обнаружена внутренняя несогласованность ADR: общие правила требуют раздел «Альтернативы, которые были отклонены» в каждом решении, но существующие ADR-0001–ADR-0015 ещё не дополнены этим разделом;
- подтверждено расхождение версий в `README.md`, корневом `package.json`, `apps/web/package.json` и устаревшем `docs/architecture.md`;
- выявлена необходимость формально утвердить Proposed ADR и владельцев документов.

---

# Рекомендации по улучшению

## Критические улучшения

1. **Дополнить ADR-0001–ADR-0015 отклонёнными альтернативами.** Сейчас шаблон и общие правила `DECISIONS.md` требуют этот раздел, но существующие записи ему не соответствуют. Для каждой альтернативы следует указать преимущества, недостатки, причину отказа и условия пересмотра.
2. **Провести формальное утверждение стратегического комплекта документов.** Vision, Master Specification, Architecture 2.0, Roadmap, Product Backlog, Decisions и Project Status должны пройти review владельца продукта и ведущего архитектора до использования как нормативной основы.
3. **Синхронизировать сведения о версиях.** Необходимо определить единую текущую версию и обновить `README.md`, корневой `package.json`, `apps/web/package.json` и исторический `docs/architecture.md` либо явно пометить устаревшие документы.

## Улучшения управления документацией

4. **Создать единый глоссарий.** Зафиксировать официальные значения терминов `AI Platform`, `Knowledge Center`, `Support Center`, `Integration Hub`, `API Platform`, dashboard, портал, модуль, сервис, интеграция и AI-агент.
5. **Назначить владельцев.** Указать персональных владельцев Vision, Master Specification, Product Backlog, ADR и Project Status, а также периодичность их пересмотра.
6. **Определить метод расчёта готовности.** Проценты сейчас являются экспертной оценкой. Рекомендуется связать готовность версий с весами backlog-задач и выполнением обязательных критериев релиза.
7. **Ограничить контролируемое дублирование.** Project Status должен содержать краткий снимок и ссылки, а подробные требования оставаться в Master Specification, Roadmap, Product Backlog и Architecture. При обновлении следует избегать копирования больших фрагментов этих документов.

## Документы, которые рекомендуется создать следующими

8. **`docs/TEST_STRATEGY.md`.** Уровни тестирования, критические сценарии, обязательные проверки CI, критерии покрытия и release gates.
9. **`docs/SECURITY.md`.** Модель угроз, RBAC, tenant-изоляция, secrets, аудит, backup и реагирование на инциденты.
10. **`docs/DEPLOYMENT.md`.** Среды, конфигурация, миграции, production deployment, rollback, RPO/RTO и восстановление.
11. **`docs/API.md` или генерируемая OpenAPI-спецификация.** Контракты, авторизация, ошибки, версии, rate limit и webhooks.
12. **`docs/GLOSSARY.md`.** Единая продуктовая и архитектурная терминология.

## Архитектурные вопросы для дальнейшей проработки

- механизм очередей и фоновых задач;
- выбор S3-совместимого объектного хранилища;
- `pgvector` и стратегия гибридного поиска;
- production identity, MFA и SSO;
- границы AI Gateway и Integration Hub;
- целевая модель GitHub Flow относительно существующей ветки `develop`.

После выполнения этих рекомендаций следует обновить Product Backlog, статусы соответствующих ADR и очередную запись истории `PROJECT_STATUS.md`.

---

# Связанные документы

- [Vision](./VISION.md) — стратегическое направление и пятилетнее видение;
- [Master Specification](./MASTER_SPECIFICATION.md) — главный нормативный документ проекта;
- [Roadmap](./ROADMAP.md) — последовательность версий и критерии готовности;
- [Product Backlog](./PRODUCT_BACKLOG.md) — эпики, задачи, приоритеты и статусы;
- [Architecture 2.0](./ARCHITECTURE_2_0.md) — целевая архитектура и план перехода;
- [Architecture Decision Records](./DECISIONS.md) — принятые и предлагаемые архитектурные решения;
- [TASK-005](./tasks/TASK-005.md) — текущая production-readiness задача;
- [Production Readiness Checklist](./PRODUCTION_READINESS_CHECKLIST.md) — environment-specific go-live gates;
- [Codex Rules](./CODEX_RULES.md) — правила работы Codex в проекте;
- [AGENTS.md](../AGENTS.md) — обязательные инструкции для агентов.
