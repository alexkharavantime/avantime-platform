# TASK-007 — Unified Client Portal

**Статус:** Completed  
**Рабочая ветка:** `feature/task-007-unified-client-portal`  
**Дата начала:** 2026-07-29

## Цель

Объединить клиентские сценарии `/portal` и экспериментального `/dashboard` в один
защищённый кабинет с каноническим namespace `/portal`, не удаляя совместимые маршруты и не
смешивая клиентские и административные функции.

## Объём

- аудит маршрутов, функций, session/tenant boundaries и навигации;
- единая responsive оболочка `/portal` с keyboard navigation, breadcrumbs, loading и error states;
- канонические страницы главной, обращений, документов, knowledge/AI, компании, команды,
  уведомлений и настроек;
- server-side session membership validation и tenant derivation только из session;
- client-safe document list/detail/preview/download/search/RAG без admin operations;
- перенос document upload/delete/reprocess tooling в `/admin/documents`;
- compatibility redirects `/dashboard/**` с сохранением query и deep links;
- tenant-scoped notification center с безопасными ссылками, read state и pagination;
- regression tests и синхронизация документации.

## Критерии приёмки

- [x] `/portal` выбран каноническим клиентским namespace.
- [x] `/dashboard/**` не содержит параллельной клиентской оболочки и сохраняет совместимость.
- [x] Protected portal render и APIs повторно проверяют active user, role и company membership.
- [x] Cross-tenant request, attachment, document и team invite access не раскрывает ресурс.
- [x] Client document response не содержит worker/provider/error internals.
- [x] Reprocess, reindex, upload и delete документов остаются административными.
- [x] RAG сохраняет rate/budget/prompt protections, citations и no-answer behavior.
- [x] Notification center tenant-scoped и не принимает client-provided `companyId`.
- [x] Существующие роли `CLIENT` и `ADMIN` не расширены.
- [x] Unit/security tests пройдены на точном финальном tree.
- [x] Typecheck, lint и build пройдены.
- [x] Применимые integration и migration gates пройдены.
- [x] Scoped Prettier, `git diff --check`, secret scan и documentation link check пройдены.

## Результат выполнения

Реализованы route consolidation, unified shell, membership validation, client-safe document/RAG
access, notification center, admin document boundary и compatibility redirects.

Фактически выполнены:

- web unit/security suite — 116/116 успешно на финальном tree;
- `npm run typecheck`, `npm run lint`, `npm run build` — успешно;
- clean migration deploy и `npm run test:integration` — 18/18 успешно;
- production integration — 1/1, RAG integration — 1/1, OCR Docker integration — 1/1;
- empty/legacy migration rehearsal — успешно;
- authorization/tenant-isolation regressions, route/link validation, client `companyId` scan,
  scoped Prettier, Prisma validation, documentation link check, secret scan и
  `git diff --check` — успешно.

Добавлен общий tenant-aware portal audit helper с закрытым allowlist:
`portal.access`, `portal.document.download`, `portal.company.update`, `portal.team.invite` и
`portal.notification.read`. Tenant и actor берутся только из server-side session; записываются
action, target type, безопасный target ID, success/failure result, correlation ID и только
`sizeBytes` для download. URL/query/pathname, user/company names, emails/invitations, filenames,
document/request/message/search/AI content, provider/model data, credentials и raw errors
отбрасываются. Временная ошибка audit sink обрабатывается fail-open без возврата внутренних
деталей клиенту. Существующие document/request mutation events и RAG telemetry не дублируются.

Browser test stack отсутствует в dependency tree, поэтому browser smoke, визуальная проверка
desktop/tablet/mobile и ручной accessibility review не выполнялись и не заявляются как passed.
Статические accessibility checks покрыты semantic/ARIA regression tests, ESLint и production
build. Это не является blocking gate, поскольку исходный критерий требовал browser smoke только
при поддержке текущим test stack.

## Известные ограничения

- TASK-007 не добавляет новую организационную RBAC-модель: роли остаются `CLIENT`/`ADMIN`.
- Двусторонняя Jira-синхронизация не входит в scope.
- Public AI chat не создаётся; client AI использует существующий tenant-aware RAG.
- Published articles и tenant documents остаются разными persistence-моделями; портал объединяет
  их UX, но не выполняет рискованную миграцию данных.
- Browser review фиксируется только при наличии настроенного browser test stack.

## Связанные документы

- [Portal Architecture](../PORTAL_ARCHITECTURE.md)
- [Architecture 2.0](../ARCHITECTURE_2_0.md)
- [Architecture Decisions](../DECISIONS.md)
- [Product Backlog](../PRODUCT_BACKLOG.md)
- [Roadmap](../ROADMAP.md)
- [Project Status](../PROJECT_STATUS.md)
- [Security Hardening](../SECURITY_HARDENING.md)
- [Codex Workflow](../CODEX_WORKFLOW.md)
