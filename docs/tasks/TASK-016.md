# TASK-016 — Create Jira ticket from customer portal

**Статус:** Done (repository/test-adapter scope; real Jira Cloud validation pending)  
**Ветка:** `feature/task-016-jira-ticket-creation`

## Цель

Завершить односторонний сценарий: сохранить клиентское обращение локально, атомарно поставить
создание Jira issue в отдельную durable queue, безопасно обработать её worker-ом и показать
клиенту результат без раскрытия внутренних данных Jira.

## Gap matrix

| Шаг                  | Состояние до TASK-016                                  | Missing piece                                           | Риск                                      | Acceptance check                                          |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Создание обращения   | HTTP request синхронно вызывал Jira после local save   | Атомарный local request + durable operation             | Потерянная операция или медленный request | Transaction integration test                              |
| Organization mapping | Project/issue type брались из общих environment values | Tenant-bound versioned mapping                          | Cross-tenant project selection            | Mapping isolation and disabled/missing tests              |
| Jira provider        | Один cloud helper без disabled/test contracts          | Typed disabled/test/cloud adapters                      | Сеть в CI, secret/error leakage           | Exact unit tests and no-network test adapter              |
| Idempotency          | Не было durable provider marker и operation guard      | Unique request/operation keys and reconciliation marker | Duplicate Jira issue                      | Concurrent workers and duplicate replay tests             |
| Retry/recovery       | Не было lease, bounded backoff и DLQ                   | Separate queue, database time, lease recovery           | Stuck or infinite operation               | Transient, permanent, max-attempt and expired-lease tests |
| Portal status        | Показывался только optional Jira key                   | Safe integration lifecycle                              | Raw provider diagnostics visible          | Browser pending → created and tenant denial               |
| Operations           | Не было Jira worker/readiness/CLI                      | Heartbeat, safe inspect/retry/DLQ/connectivity commands | Необнаруженный backlog                    | Readiness and static scan                                 |

## Реализованный объём

- typed Jira configuration `disabled|test|cloud`, disabled by default, HTTPS/placeholder/credential
  validation and redacted diagnostics;
- one enabled/versioned mapping per organization, resolved only by server tenant context;
- normalized local request Jira fields and separate `JiraOperation` queue with unique idempotency,
  database-authoritative claims, leases, bounded exponential retry and DLQ;
- atomic request, operation and allowlisted audit creation in one PostgreSQL transaction;
- deterministic no-network test provider and Jira Cloud REST adapter with safe payload projection
  and provider-marker reconciliation;
- separate Jira worker, heartbeat/readiness, safe operational CLI and local staging smoke;
- portal form/status UI, duplicate-submit protection, safe issue link and success notification through
  the existing notification outbox;
- unit, PostgreSQL integration, Playwright lifecycle/responsive/accessibility and blocking static
  security coverage.

## Критерии приёмки

- [x] local request persists before any provider call;
- [x] request and Jira operation enqueue atomically;
- [x] client cannot select mapping/project/credentials;
- [x] one request creates at most one operation and one test-adapter issue;
- [x] concurrent claims, expired leases, bounded retry and DLQ are covered;
- [x] issue ID/key/HTTPS URL persist only on terminal success;
- [x] disabled or missing mapping preserves a visible `NOT_CONFIGURED` request;
- [x] audit and customer notification contain only safe references;
- [x] browser flow proves pending → created, replay idempotency and tenant isolation;
- [x] repository tests, scans and build pass;
- [ ] real Jira Cloud credentials/connectivity/issue creation — `PENDING`, intentionally not called;
- [ ] bidirectional status/comments/attachments synchronization — TASK-017 or later.

## Результат выполнения

Repository implementation validated on 2026-08-02 with the deterministic test adapter. Two
consecutive full integration runs passed 27/27 each; the targeted Jira integration test and four
targeted Chromium browser cases passed. Full unit suite passed 179/179; migration rehearsal passed
empty/legacy/repeated deploy with 14 migrations; production Next.js build generated 104 route
entries. Host-based local staging smoke passed 12 checks with isolated PostgreSQL, Redis, MinIO and
all three workers. Static security and documentation gates passed. A separate cold Docker image
build could not complete `npm ci` because the external registry reset/stalled twice; it did not
reach application compilation. Real Jira Cloud validation and production readiness are not
claimed.

## Известные ограничения

- Cloud adapter contract is implemented against Jira Cloud REST v3 but was not called with real
  credentials;
- mapping administration UI is intentionally absent; mapping changes use server-side operations;
- status/comment synchronization belongs to TASK-017; attachments remain outside TASK-016;
- managed staging deployment, external monitoring and provider evidence remain pending;
- TASK-006 and Draft PR #11 were not modified.

## Связанные документы

- [Jira integration](../JIRA_INTEGRATION.md)
- [Jira worker runbook](../runbooks/jira-worker.md)
- [Staging infrastructure](../STAGING_INFRASTRUCTURE.md)
- [Testing](../TESTING.md)
- [TASK-015](./TASK-015.md)
