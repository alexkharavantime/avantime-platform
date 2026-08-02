# Provider-backed notification outbox

## Contract

`NotificationOutbox` is separate from the in-product `GovernanceNotification`. A database trigger
creates the provider record in the same transaction as every governance inbox notification. The
outbox stores notification/template type, correlation/idempotency keys and a user reference; it
does not store email body, raw provider payload, credentials, document content or recipient email.

States are `PENDING`, `PROCESSING`, `DELIVERED`, `FAILED`, `DEAD_LETTER`. Every claim increments a
bounded attempt counter and owns a random lease token. PostgreSQL `FOR UPDATE SKIP LOCKED` prevents
two workers from claiming the same row. Completion/failure updates require the exact lease token.
Expired leases are recoverable; exhausted leases go to DLQ.

## Delivery semantics

- idempotency key is unique in PostgreSQL and sent to the provider;
- exponential backoff is capped at five minutes and retries are capped at 20 by schema/config;
- test adapter is deterministic, local/CI-only and never sends a real notification;
- Resend resolves the active user's address just-in-time and never logs it;
- provider acceptance keeps the row in `PROCESSING`; only terminal `delivered` receipt sets
  `DELIVERED` and `deliveredAt`;
- safe failure codes are stored; raw response text is discarded;
- manual retry is allowed only from `DEAD_LETTER` and resets the bounded attempt lifecycle.

## Operations

```bash
npm run staging:notification-worker -- --once
npm run staging:worker-health -- notification
npm run staging:notification-retry -- <outbox-id>
```

Worker logs contain worker ID, counts and safe status only. `NotificationWorkerHeartbeat` binds
worker/application/deployment generations. A stale heartbeat or mismatched generation blocks
readiness.

## Limitations

Managed sender/domain and terminal webhook/poll behavior require validation against the selected
provider. Production adapter is never enabled by local configuration. Identity one-time-code email
security remains a separate boundary and is not redirected through this governance outbox.

## Связанные документы

- [Notification validation](./NOTIFICATION_VALIDATION.md)
- [Notification outbox runbook](./runbooks/notification-outbox.md)
- [Staging infrastructure](./STAGING_INFRASTRUCTURE.md)
- [Security hardening](./SECURITY_HARDENING.md)
