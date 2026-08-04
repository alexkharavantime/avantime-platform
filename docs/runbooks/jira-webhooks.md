# Jira webhook runbook

## Preflight

```bash
npm run staging:config-check
npm run staging:jira-operations -- connectivity
npm run staging:jira-operations -- inspect-inbound
```

Confirm the exact HTTPS tenant origin, webhook mode, event allowlist, fresh inbound-worker heartbeat
and zero DLQ. Never print or paste the secret, raw request, comment body, author email or signature.

## Worker and replay

```bash
npm run staging:jira-operations -- inbound-worker-once
npm run staging:jira-inbound-worker
npm run staging:jira-operations -- replay-test <local-request-public-id>
```

`replay-test` is allowed only in test mode and builds a synthetic event from the server-side
persisted issue link. It does not contact Jira Cloud.

## Retry and DLQ

```bash
npm run staging:jira-operations -- retry-inbound <event-id>
npm run staging:jira-operations -- dead-letter-inbound <event-id>
```

Mutations deny production without the existing explicit confirmation guard. Investigate safe
error code, event type, fingerprint prefix, attempts, next attempt and lease expiry. Do not edit
leases, raw payload or tenant fields manually and do not increase retry limits to hide an outage.

## Incident policy

- invalid HMAC, tenant, age or body size: deny and rotate/re-register only through approved change;
- unknown issue: safe ignore, then verify persisted issue mapping server-side;
- private comment exposure: disable webhook mode, preserve audit, treat as security incident;
- stale status: expected `IGNORED`; verify Jira timestamps before retrying;
- backlog/DLQ growth: stop deployment promotion, inspect heartbeat/provider permissions;
- issue deletion: local request remains intact and Jira integration becomes visibly failed.

## Связанные документы

- [Jira webhooks](../JIRA_WEBHOOKS.md)
- [Jira integration](../JIRA_INTEGRATION.md)
- [Jira worker](./jira-worker.md)
- [TASK-017](../tasks/TASK-017.md)
