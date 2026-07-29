# Staging Operations

## Commands

```bash
npm run staging:config-check
npm run staging:readiness
npm run staging:tls-check
npm run staging:provider-check
npm run staging:alert-test
npm run staging:backup
npm run staging:restore-rehearsal
npm run staging:smoke -- --integration
npm run staging:load-smoke -- --integration
npm run staging:evidence -- --example
```

Exit `0` means the invoked check passed or produced a safe plan. Exit `1` is a
validation/execution failure. Exit `2` means the evaluated go-live state is
blocked or scanner findings require classification.

## Secrets and rotation

Supported sources are environment injection, mounted files and an external
provider contract. File-to-environment conversion is allowlisted and uses
`spawn` without a shell. A value and its `_FILE` variant cannot coexist.
Placeholders, missing versions and stale timestamps fail validation.

Rotation:

1. create a new environment-specific version;
2. stage it without logging its value;
3. restart one instance and verify readiness;
4. roll all processes;
5. revoke the old version;
6. record version/evidence only.

## Monitoring and alerts

The Compose path includes an OTLP collector and private Prometheus. Production
telemetry already rejects content-bearing attributes. External dashboard and
alert routing remain pending until the selected staging destination acknowledges
both `staging.test.triggered` and `staging.test.resolved` with one correlation ID.

## Backup and incidents

Backup and restore commands reuse TASK-005 encryption and isolated-target guards.
A managed rehearsal must restore PostgreSQL/pgvector and objects into separate
database/bucket boundaries, verify checksums/schema/sample queries, then clean up
only the isolated target.

Use existing [Queue Operations](./QUEUE_OPERATIONS.md) and
[Disaster Recovery](./DISASTER_RECOVERY.md) procedures; this document adds only
the staging boundary.

## Related documents

- [Staging Deployment](./STAGING_DEPLOYMENT.md)
- [Observability](./OBSERVABILITY.md)
- [Go-Live Checklist](./GO_LIVE_CHECKLIST.md)
- [TASK-006](./tasks/TASK-006.md)
