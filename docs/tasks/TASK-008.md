# TASK-008 — Browser smoke и accessibility automation

**Статус:** Done  
**Рабочая ветка:** `feature/task-008-browser-accessibility`  
**Дата начала:** 2026-07-30

## Цель

Добавить воспроизводимый blocking browser gate для канонического client portal, legacy route
compatibility, tenant isolation, responsive поведения и WCAG A/AA без изменения production
RBAC или архитектуры TASK-006.

## Объём

- Playwright и Chromium с отдельной axe accessibility проверкой;
- изолированная PostgreSQL browser database и детерминированные fixtures двух tenants;
- обычная DB authentication для `CLIENT` и `ADMIN`;
- portal smoke, `/dashboard/**` compatibility и tenant-isolation regression;
- desktop/tablet/mobile, keyboard и mobile dialog scenarios;
- безопасные failure screenshots, traces, axe и network/console diagnostics;
- отдельный blocking GitHub Actions job;
- документация запуска, ограничений и результатов.

## Критерии приёмки

- [x] Browser database guard допускает только loopback и точное test database name.
- [x] Fixtures содержат два tenants, `CLIENT` каждого tenant и отдельного `ADMIN`.
- [x] Login проходит через обычный серверный auth route без cookie injection и demo bypass.
- [x] Portal smoke и compatibility routes автоматизированы.
- [x] Cross-tenant request, document, notification и client `companyId` scenarios покрыты.
- [x] Axe WCAG A/AA `critical`/`serious` findings являются blocking.
- [x] Desktop/tablet/mobile и keyboard/mobile menu scenarios автоматизированы.
- [x] Failure artifacts не сохраняют raw headers, cookies, credentials или request bodies.
- [x] CI browser job изолирован и является blocking.
- [x] Полный browser suite фактически прошёл.
- [x] Unit, typecheck, lint, build и применимые regression gates прошли на финальном tree.
- [x] Scoped Prettier, `git diff --check`, secret scan и documentation link check прошли.

## Результат выполнения

Реализован отдельный Playwright/Chromium stack с guarded database reset, migration/schema sync,
deterministic seed, обычной DB authentication и безопасными failure artifacts. В CI добавлен
blocking `browser-accessibility` job после `quality`, со своим PostgreSQL/pgvector service и
upload artifacts только при failure.

Фактически выполнены:

- npm dependencies установлены; добавлены Playwright 1.62, `@axe-core/playwright` 4.12 и
  trace ZIP sanitizer;
- полный browser suite — 43/43 успешно: desktop smoke, compatibility, tenant isolation,
  desktop/tablet/mobile и keyboard scenarios;
- axe WCAG A/AA — 8 основных portal pages, remaining `critical`/`serious` violations: 0;
- unit/security suite — 117/117, включая trace redaction regression;
- `npm run typecheck`, `npm run lint` и production `npm run build` — успешно; build создал 66/66
  static entries;
- scoped Prettier, client source `companyId` scan, secret scan, documentation link check для
  45 Markdown files и `git diff --check` — успешно.

Первый реальный axe run обнаружил недостаточный link contrast из-за unlayered global anchor color.
Дополнительно исправлены labels team form, live status/alert semantics, admin `h1`, login
hydration guard и mobile dialog focus/Escape behavior. Axe rules и impact threshold не
исключались. Многостраничный smoke также выявил размножение Prisma pools между Next dev bundles;
process-wide Prisma singleton устранил connection exhaustion без изменения persistence boundary.

Ручной screen-reader/assistive-technology аудит не входит в автоматический gate и не заявляется
как passed.

## Известные ограничения

- Роли остаются `CLIENT`/`ADMIN`; browser fixture `USER` представлен существующим `CLIENT`.
- macOS 11 использует установленный Chromium-compatible Google Chrome, поскольку Playwright 1.62
  не предоставляет bundled Chromium для этой legacy OS; локальный browser фактически запущен,
  Linux CI настроен на bundled revision, но сам GitHub job в этой рабочей копии ещё не выполнялся.
- axe покрывает машинно определяемые нарушения и не заменяет ручной accessibility review.
- TASK-008 не меняет production architecture, container policy или TASK-006.

## Связанные документы

- [Browser Testing](../BROWSER_TESTING.md)
- [Portal Architecture](../PORTAL_ARCHITECTURE.md)
- [Architecture Decisions](../DECISIONS.md)
- [Product Backlog](../PRODUCT_BACKLOG.md)
- [Roadmap](../ROADMAP.md)
- [Project Status](../PROJECT_STATUS.md)
- [Codex Workflow](../CODEX_WORKFLOW.md)
