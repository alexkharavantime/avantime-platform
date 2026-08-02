# Runbook: staging rollback

## Decision gate

Confirm the previous immutable image digests, current migration version and documented
forward/backward schema compatibility. Automatic database rollback is not supported.

## Procedure

1. Preserve failed deployment logs, readiness/smoke evidence and provider/index queue state.
2. Disable the affected feature flag when available.
3. Pause notification and knowledge workers to prevent mixed-version processing.
4. Confirm previous worker understands current outbox/index schema.
5. Update image references to previous digests; do not run an older migration job.
6. Start compatible previous workers, then web.
7. Verify `/health`, `/ready`, unauthorized API behavior and tenant smoke.
8. Confirm no duplicate notification, stuck lease or stale/private knowledge result.
9. Record rollback evidence and escalation owner.

If schema is not backward-compatible, leave the new schema intact, keep affected features/workers
paused and use an approved forward fix. Restore rehearsal is for isolated validation, not an
in-place rollback mechanism.

## Связанные документы

- [Staging deployment](../STAGING_DEPLOYMENT.md)
- [Staging deploy](./staging-deploy.md)
- [Backup and restore](../BACKUP_RESTORE.md)
