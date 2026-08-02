# Runbook: notification outbox

## Inspect

Use protected diagnostics/SQL access to inspect counts by status, oldest due timestamp, attempts,
safe failure code and worker heartbeat. Do not export recipient IDs/emails or raw provider payload.

## Retry and DLQ

1. Confirm provider configuration and worker generation.
2. Check whether a provider message ID already has terminal delivery before any manual retry.
3. Fix the external cause; do not change `maxAttempts` above the bounded policy.
4. Run `npm run staging:notification-retry -- <outbox-id>` for one approved DLQ row.
5. Observe a new claim and terminal receipt; preserve correlation/provider message IDs.
6. Escalate repeated DLQ instead of looping manual retries.

For suspected duplicate delivery, pause the worker, compare idempotency/provider IDs, retain both
receipts and do not delete the durable row.

## Связанные документы

- [Notification outbox](../NOTIFICATION_OUTBOX.md)
- [Notification validation](../NOTIFICATION_VALIDATION.md)
- [Staging rollback](./staging-rollback.md)
