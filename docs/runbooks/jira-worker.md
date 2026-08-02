# Jira worker runbook

## Safety boundary

The worker creates Jira issues from durable `JiraOperation` rows. It does not synchronize status,
comments or attachments and never sends email directly. Use only safe IDs/correlation references
in operational evidence; never copy tokens, descriptions or raw provider responses.

## Preflight

```bash
npm run staging:config-check
npm run staging:jira-operations -- mapping --company-id=<company-id>
npm run staging:jira-operations -- connectivity
npm run staging:jira-operations -- inspect
```

`connectivity` uses the deterministic adapter in test mode. Cloud validation needs explicit
approved credentials/environment and must not be inferred from local success.

## Processing

```bash
npm run staging:jira-operations -- worker-once
npm run staging:jira-worker
```

Continuous mode uses bounded polling and graceful SIGINT/SIGTERM shutdown. Readiness requires a
fresh matching worker heartbeat when Jira is enabled. Inspect backlog and DLQ before and after a
deployment.

## Retry and DLQ

Transient failures are automatically rescheduled with bounded exponential backoff. Permanent or
exhausted operations enter `DEAD_LETTER`. After correcting the cause, retry one exact operation:

```bash
npm run staging:jira-operations -- retry --operation-id=<operation-id>
```

To move an already failed exact operation to DLQ under incident policy:

```bash
npm run staging:jira-operations -- dead-letter --operation-id=<operation-id>
```

Mutation commands deny production by default and require the CLI's explicit production
confirmation. Never bulk-delete queue rows or clear leases manually. Preserve audit and correlation
IDs for investigation.

## Incident checks

- confirm configuration mode and mapping enabled/version;
- inspect safe status, attempt count, next attempt, lease expiry and normalized error code;
- check worker generation/heartbeat and DB clock;
- verify whether the provider marker already resolves to an issue before manual intervention;
- keep the local request available to the customer throughout recovery;
- escalate a growing DLQ or stale heartbeat; do not increase retries to conceal an outage.

## Связанные документы

- [Jira integration](../JIRA_INTEGRATION.md)
- [TASK-016](../tasks/TASK-016.md)
- [Staging deployment](../STAGING_DEPLOYMENT.md)
- [Notification outbox](./notification-outbox.md)
