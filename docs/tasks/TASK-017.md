# TASK-017 — Jira status and comment synchronization

## Статус

`In Progress` — repository implementation и доступные локальные PostgreSQL, migration и browser
gates выполнены; local/managed staging smoke и actual Jira Cloud delivery требуют отдельной среды.

## Рабочая ветка

`feature/task-017-jira-sync`

## Цель

Безопасно синхронизировать Jira-owned статус и только явно публичные комментарии в портал, а
клиентские комментарии передавать в Jira через durable worker без дублей и cross-tenant доступа.
Вложения не входят в задачу.

## Gap matrix

| Сценарий              | Реализация до TASK-017                 | Missing piece                           | Основной риск                        | Acceptance check                                               |
| --------------------- | -------------------------------------- | --------------------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| Jira status → portal  | Только создание issue и `jiraSyncAt`   | Webhook, mapping, stale fence           | Старое событие откатывает статус     | Newer status применяется, stale/terminal conflict игнорируется |
| Jira comment → portal | `RequestMessage` только с local `User` | Public policy, safe ADF, provider ID    | Раскрытие private comment/author IDs | Public импортируется один раз, private body не хранится        |
| Portal comment → Jira | Local synchronous message              | Atomic `ADD_COMMENT` operation          | HTTP зависит от Jira/duplicate send  | Local commit + queue; concurrent worker sends once             |
| Webhook authenticity  | Отсутствовала                          | Raw-body HMAC, allowlisted tenant       | Forged/replayed payload              | Invalid HMAC/tenant/age/size denied                            |
| Inbound durability    | Отсутствовала                          | Event queue, lease, retry/DLQ           | Потеря или двойная обработка         | Fingerprint unique, `SKIP LOCKED`, expired lease recovery      |
| Tenant isolation      | Issue ID/key хранились на request      | Resolve tenant only from persisted pair | Payload selects another tenant       | Unknown/foreign pair never binds                               |
| Notifications/audit   | Только issue-created                   | Worker-side status/comment events       | Sensitive comment in mail/log        | Safe references only; no body/email/token                      |
| Operations/readiness  | Только outbound Jira worker            | Inbound CLI/heartbeat/backlog           | Необнаруженная остановка sync        | Separate heartbeat, backlog/DLQ diagnostics                    |

## Реализованный объём

- secure admin webhook HMAC-SHA256 over exact UTF-8 raw body (`X-Hub-Signature`), HTTPS Jira tenant
  allowlist, replay window, payload limit и event allowlist;
- отдельная `JiraInboundEvent` queue с normalized payload, fingerprint/provider uniqueness,
  database-time claim, lease, retry, DLQ, retention и worker heartbeat;
- organization-specific status mapping, `jiraUpdatedAt` fencing, terminal rollback denial и sync
  version;
- strict JSM public marker policy, ADF-to-plain-text projection, author redaction, private/automation
  denial и versioned comment update;
- transactional local customer comment + `ADD_COMMENT`, deterministic/cloud adapters,
  reconciliation marker, bounded retry/DLQ и manual retry operations;
- safe portal timeline, author/delivery states, synchronized timestamp, live form status;
- portal/email outbox notifications from the worker, allowlisted audit events, readiness/CLI/security
  gates, unit/integration/browser fixtures and documentation.

## Критерии приёмки

- [x] webhook disabled by default and raw body HMAC contract implemented;
- [x] oversized, expired, invalid-secret and foreign-origin events fail closed;
- [x] inbound event is durable, idempotent and tenant-bound through persisted issue ID/key;
- [x] unknown/stale/terminal-conflicting status cannot overwrite the portal;
- [x] only explicit public, non-automation comments can be imported;
- [x] private comment body is neither stored nor logged;
- [x] local comment and `ADD_COMMENT` enqueue are atomic and idempotent;
- [x] retries, DLQ, concurrent claim and lease recovery remain bounded;
- [x] UI exposes only safe status/comment state;
- [x] attachments remain out of scope;
- [x] full PostgreSQL integration suite — PASS, 31/31 на текущем дереве;
- [x] targeted Chromium flow — PASS в полном browser suite 77/77;
- [x] migration rehearsal — PASS для empty/legacy/repeated deploy, 17 migrations;
- [ ] local/managed staging smoke — отдельный environment gate, в TASK-018 не запускался;
- [ ] actual Jira Cloud webhook registration/delivery — external `PENDING` gate.

## Результат выполнения

Pure unit/security contracts, Docker-backed PostgreSQL integration, migration rehearsal и Chromium
flow прошли локально. TASK-017 остаётся `In Progress` до actual Jira Cloud webhook/JSM validation и
разрешённых staging/observability gates. Эти локальные результаты не доказывают production readiness.

## Известные ограничения

- actual Jira Cloud webhook secret rotation, delivery headers and JSM permissions are unvalidated;
- the Cloud comment reconciliation scans a bounded public-comment page and requires appropriate
  Jira Service Management permissions;
- comment deletion is intentionally not enabled; attachments remain TASK-018 or later;
- manual UI for organization status mapping is not included;
- managed observability/alerting and retention scheduler remain deployment work.

## Связанные документы

- [Jira integration](../JIRA_INTEGRATION.md)
- [Jira webhooks](../JIRA_WEBHOOKS.md)
- [Jira webhook runbook](../runbooks/jira-webhooks.md)
- [Jira worker runbook](../runbooks/jira-worker.md)
- [Testing](../TESTING.md)
- [TASK-016](./TASK-016.md)
