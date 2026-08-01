# TASK-013 — Governance staging bootstrap and operational validation

**Статус:** Done  
**Рабочая ветка:** `feature/task-013-governance-validation`  
**Дата начала:** 2026-08-01
**Дата завершения repository-level scope:** 2026-08-01

## Цель и границы

Завершить repository-level подготовку first-owner bootstrap, support/approval/knowledge ceremonies,
sanitized evidence, operational runbooks и воспроизводимую simulated validation. Managed staging,
manual assistive-technology review и production ceremony не выполняются и остаются `PENDING`.
TASK-006 и Draft PR #11 вне scope.

## Реализованный scope

- hash-only, environment-bound, TOTP/recent-auth first `PLATFORM_OWNER` bootstrap с dry-run,
  singleton ledger, transaction advisory lock, session revocation, audit и notification;
- controlled CLI для bootstrap, owners, approvals, support, expiry/termination, evidence и
  invariants без secret argv;
- durable executed-approval evidence и database constraint для organization PUBLIC knowledge;
- organization knowledge REVIEW/PUBLISHED/ARCHIVED server-side lifecycle;
- support termination, stale approval expiry, connected-executor registry и same-origin gates;
- machine-readable evidence schema с denylist/redaction validation и безопасными file modes;
- unit, integration и Playwright ceremony tests, governance static scan и documentation gate;
- runbooks, gap matrix, manual checklist и ADR-0030.

## Критерии приёмки

- [x] first owner не выводится из legacy/browser данных;
- [x] duplicate/concurrent bootstrap защищён транзакцией и singleton;
- [x] dry-run не мутирует данные;
- [x] support/approval/publication ceremonies воспроизводимы на synthetic fixtures;
- [x] evidence validator запрещает credentials/content и хеширует actor identifiers;
- [x] CI не выполняет managed staging bootstrap;
- [ ] managed staging ceremony — `PENDING`;
- [ ] manual keyboard/screen-reader/UX checklist — `PENDING`;
- [ ] production ceremony/readiness — вне TASK-013.

## Результат выполнения

Repository implementation завершена: локальные simulated ceremonies, tests, scans, migration
rehearsal, production build с test-only environment и documentation gates прошли. Managed staging
evidence, reviewer sign-off и manual assistive-technology review не создавались и остаются
`PENDING`; статус `Done` относится только к repository-level scope TASK-013.

## Известные ограничения

Production bootstrap намеренно отсутствует. Если все владельцы недоступны, требуется отдельно
утверждённая manual recovery authority. Registry-only actions остаются fail-closed до появления
resolver+executor. Реальная delivery notification, cache/index invalidation и assistive technology
проверяются только в managed staging.

## Связанные документы

- [Governance Bootstrap](../GOVERNANCE_BOOTSTRAP.md)
- [Governance Validation](../GOVERNANCE_VALIDATION.md)
- [Governance Evidence](../GOVERNANCE_EVIDENCE.md)
- [Approval Workflow](../APPROVAL_WORKFLOW.md)
- [Platform Governance](../PLATFORM_GOVERNANCE.md)
- [Knowledge Governance](../KNOWLEDGE_GOVERNANCE.md)
- [ADR-0030](../DECISIONS.md#adr-0030)
