# TASK-014 — Managed staging governance validation and dependency remediation

**Статус:** Done (repository scope); managed staging gates `PENDING/BLOCKED`  
**Ветка:** `feature/task-014-managed-staging-validation`

## Цель

Подготовить fail-closed tooling и evidence boundary для внешней проверки TASK-012/013, выполнить
доступные repository/CI simulations и безопасно устранить совместимый dependency advisory. Не
выполнять production bootstrap/recovery и не выдавать отсутствие managed staging за readiness.

## Реализованный объём

- read-only staging preflight для commit/migration/DB/Redis/S3/provider/pgvector/app/governance
  state/invariants/version, flags и отсутствия placeholder secrets;
- ручная staging boundary с exact environment/phrase, recent MFA, external secret-store reference,
  correlation ID и запретом production/automation;
- canonical write-once evidence envelope и отдельный operator/reviewer sign-off с tamper detection;
- sanitized terminal notification receipt и measurable invalidation schemas;
- bounded polling без arbitrary sleep;
- staging-only two-person last-owner recovery policy drill без grant executor/backdoor;
- dependency audit parser и expiring risk policy; совместимый lock refresh
  `brace-expansion 1.1.16 -> 1.1.18`;
- unit/integration simulation, static governance controls, CI simulation/dependency gates и
  операционная документация.

## Критерии приёмки

- [x] production отклоняется и CI не может создать reviewer sign-off;
- [x] preflight структурирован, read-only и non-zero на blocker;
- [x] evidence canonical, write-once, secret-safe и проверяется по SHA-256;
- [x] reviewer отделён от operator;
- [x] notification/invalidation validators fail closed;
- [x] recovery не создаёт постоянный или универсальный доступ;
- [x] critical dependency gate не ослаблен, force/downgrade не применены;
- [x] repository simulation и документированные команды добавлены;
- [ ] managed staging preflight и ceremonies — `PENDING`, среды/доступа нет;
- [ ] real governance notification delivery — `BLOCKED`, provider-backed outbox отсутствует;
- [ ] knowledge cache/search/RAG invalidation — `BLOCKED`, article adapters отсутствуют;
- [ ] independent reviewer sign-off — `PENDING`;
- [ ] manual accessibility/UX review — `PENDING`.

## Результат выполнения

Repository boundary готова к безопасному запуску оператором, но внешний запуск намеренно не
выполнялся. Gap matrix находится в
[Managed staging validation](../MANAGED_STAGING_VALIDATION.md). Fresh official audit от 2026-08-02
после remediation содержит 3 high aggregate/package findings: `next`, nested `postcss` и optional
`sharp`, 0 critical. Оставшиеся build/runtime-unreachable риски приняты только до 2026-08-12 как
`AR-DEP-2026-002/003`; expiry автоматически блокирует report.

TASK-014 не означает production readiness, не создаёт production bootstrap и не изменяет
production rate/security policy. Фактические результаты команд фиксируются в итоговом отчёте
рабочей сессии; managed statuses меняются только после реальной среды и независимой подписи.

## Известные ограничения

- durable governance inbox не является внешней provider delivery;
- knowledge articles не используют отдельные cache/vector generations;
- внешний secret store, staging actors, provider recipient и reviewer не предоставлены;
- `AR-DEP-2026-002/003` требуют повторной проверки не позднее 2026-08-12.

## Связанные документы

- [Managed staging validation](../MANAGED_STAGING_VALIDATION.md)
- [Governance sign-off](../GOVERNANCE_SIGNOFF.md)
- [Notification validation](../NOTIFICATION_VALIDATION.md)
- [Cache/index invalidation](../CACHE_INDEX_INVALIDATION.md)
- [Dependency risk management](../DEPENDENCY_RISK_MANAGEMENT.md)
- [Governance bootstrap](../GOVERNANCE_BOOTSTRAP.md)
- [Governance evidence](../GOVERNANCE_EVIDENCE.md)
- [TASK-012](./TASK-012.md)
- [TASK-013](./TASK-013.md)
