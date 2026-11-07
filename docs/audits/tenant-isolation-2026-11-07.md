# Изоляция арендаторов в документном контуре — 2026-11-07

Ветка: `fix/ponytail-audit` (последний коммит `68aa55a`). Аудит только по чтению кода, код не
менялся, тесты не запускались.

**Вопрос:** может ли запрос или процесс дойти до документов, текста, чанков, векторов или
очередей другой компании в обход `DocumentTenantContext` (`apps/web/lib/document-model.ts:14`)?

**Метод.** Граф graphify, построенный по коду `apps/web` и `packages` через AST: 3512 узлов,
11160 связей. `DocumentTenantContext` — второй по связности узел графа (189 связей): его
импортируют 25 файлов, больше всего `document-repositories.ts` (47), `embedding-queue.ts` (26),
`redis-lease-queue.ts` (25), `document-processing-queue.ts` (18), `vector-repository.ts` (17)
и `document-storage.ts` (11). Граф видит только импорты типа, а не фильтры в запросах, поэтому
каждый слой я проверил по коду вручную.

**Итог.** Пути к чужим данным в обход проверки арендатора я не нашёл. Есть одно место с
запасным арендатором `avantime`, которое сейчас безопасно только потому, что перед ним стоит
проверка прав. На одной странице портала такой проверки нет, но там видны только счётчики
документов.

**Статус на 2026-11-07:** находки 1 и 2 исправлены в `fc4dc14`, находка 4 в части скриптов — в `4bcb2c6`.
Находка 3 остаётся открытой: это намеренная совместимость локального драйвера. После
исправления находки 1 сессия без компании до неё не доходит.

## Находки

### 1. Пустой `companyId` молча превращается в арендатора `avantime` — Средняя (скрытый риск) — исправлено

**Исправлено в `fc4dc14`:** `getDocumentTenantContext` выбрасывает ошибку, если `companyId`
пустой или из одних пробелов. Тест: `apps/web/tests/document-tenant-context.test.ts`.

`apps/web/lib/document-model.ts:164-165`

```ts
const companyId = session.companyId?.trim() || AVANTIME_DOCUMENT_COMPANY_ID;
```

Если в сессии нет компании, функция не отказывает, а подставляет арендатора `avantime`. Сессия
без `companyId` возможна: `lib/session.ts:260` отклоняет только `CLIENT` без компании, а
платформенный `ADMIN` без членства проходит.

Сейчас через API это не эксплуатируется. Все 15 API-роутов, которые вызывают функцию
(`app/api/documents/*`, `app/api/ai`, `app/api/admin/ai/usage`), сначала вызывают
`authorizeOrganizationApi`. Та отказывает сессии без компании с кодом
`ORGANIZATION_CONTEXT_REQUIRED` (`lib/organization-permissions.ts:194-196`). Риск в том, что
любой новый вызов без этой проверки получит доступ к данным Avantime, а не ошибку. Отказ
внутри самой функции закрыл бы это для всех будущих вызовов.

### 2. Главная страница портала строит контекст без проверки прав на документы — Низкая — исправлено

**Исправлено в `fc4dc14`:** главная портала читает документы только при `documents.view`,
иначе счётчики равны нулю. Тест: `apps/web/tests/document-tenant-context.test.ts`.

`apps/web/app/portal/page.tsx:31-46`

Страница проверяет только наличие сессии (`getValidatedPortalSession`), без `documents.view`, и
вызывает `metadata.list(getDocumentTenantContext(session))`. Платформенный `ADMIN` без членства
через находку 1 получает список документов арендатора `avantime`. Наружу уходят только четыре
счётчика (всего, в обработке, требуют внимания, проиндексировано), а не имена и содержимое.
Это сотрудники Avantime, поэтому реальная утечка минимальна. Для сравнения,
`app/portal/documents/[id]/page.tsx:14` проверяет `documents.view` правильно.

### 3. Наследованные файлы без деления по арендаторам доступны арендатору `avantime` — Низкая

`apps/web/lib/document-storage.ts:216-230`, `apps/web/lib/document-repositories.ts:833-837`

Локальный драйвер для арендатора `avantime` дочитывает старые общие файлы:
`.data/documents.json`, `uploads/documents/`, `text/`, `chunks/`. Это намеренная совместимость,
и только в `LocalDocumentStorage`. Production отвергает локальные адаптеры, а S3-ключи всегда
содержат компанию (`documents/${companyId}/...`, `document-storage.ts:132`). Вместе с находкой 1
это значит, что сессия без компании на локальном стенде видит наследованные данные.

### 4. Скрипты обслуживания по умолчанию работают с арендатором `avantime` — Низкая (эксплуатационный риск) — частично исправлено

**Исправлено в `4bcb2c6`:** `documents:cleanup` и `documents:migrate` падают без
`--tenant=<companyId>`. Переменные `CLEANUP_TENANT_ID` и `MIGRATION_TENANT_ID` больше не
читаются. Команды в `docs/tasks/TASK-002.md` обновлены. Тест:
`apps/web/tests/document-script-tenant.test.ts`. Значение по умолчанию для воркера
(`DOCUMENT_WORKER_TENANT_ID` вне production) не менялось.

- `apps/web/scripts/cleanup-deleted-documents.ts:11-12`: `--tenant` → `CLEANUP_TENANT_ID` → `avantime`.
- `apps/web/scripts/migrate-documents.ts:37`: `--tenant` → `MIGRATION_TENANT_ID` → `avantime`.
- `apps/web/lib/document-configuration.ts:282-284`: воркер берёт `DOCUMENT_WORKER_TENANT_ID`;
  вне production по умолчанию `avantime`, в production переменная обязательна.

Это не обход изоляции: каждый процесс работает строго с одним арендатором. Но запуск очистки
без аргумента молча чистит удалённые документы Avantime, а не падает.

## Что проверено и в порядке

- **Метаданные (PostgreSQL).** Все `findMany`/`findFirst`/`updateMany`/`deleteMany` в
  `PostgreSQLDocumentMetadataRepository` фильтруют по `companyId: tenant.companyId`
  (`document-repositories.ts:1021-1310`). Локальный репозиторий отфильтровывает чужие записи
  (`document-repositories.ts:825-827`).
- **Векторы (pgvector).** Поиск идёт с `WHERE e."companyId" = $2` и JOIN по `companyId`
  (`vector-repository.ts:530-531`). `listByDocument`, `deleteStale`, `deleteOtherVersions` и
  `deleteDocument` тоже фильтруют по компании (`vector-repository.ts:578-639`). Тот же фильтр в
  in-memory-реализации (`vector-repository.ts:230-318`).
- **Хранилище.** `assertDocumentTenantContext` и `assertSafeDocumentSegment(companyId)` стоят
  перед каждым путём и ключом (`document-storage.ts:93-97`), S3-ключ содержит компанию
  (`document-storage.ts:132`).
- **Очереди.** Префикс Redis-ключей включает компанию: `avantime:{queue:companyId}`
  (`redis-lease-queue.ts:395`). Воркеры обработки и эмбеддингов берут арендатора из окружения и
  передают его в каждый `claim`/`findById`/`readChunks`/`acknowledge`
  (`document-processing-worker.ts:59-75`, `document-embedding.ts:78-157`).
- **Retrieval и RAG.** `DefaultHybridRetriever` получает документы, чанки и векторы через
  `request.tenant` (`retrieval.ts:332-341`, `378`, `467`, `610`). Поиск по базе знаний фильтрует
  по компании и видимости (`knowledge-retrieval.ts:19`, `knowledge-indexing.ts:39-51`).
- **Ввод клиента.** `api/ai` и `api/admin/ai/usage` явно отвергают `companyId` в теле и query
  (`TENANT_INPUT_REJECTED`). Арендатор берётся только из сессии.
- **`/api/assistant`** не читает ни документы, ни сессию, только проверяет origin.

## Не проверял

- SQL-миграции и RLS в базе: `.sql` не попали в граф (нет `tree_sitter_sql`), и вручную я их не
  читал.
- Jira, уведомления, вложения заявок (`lib/attachments.ts`) и governance — это вне документного
  контура.
- Интеграционные и браузерные тесты на изоляцию не запускал.
