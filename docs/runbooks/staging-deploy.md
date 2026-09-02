# Runbook: staging deploy

## Authorization and evidence

Obtain approved change, operator/reviewer, commit and image digests, previous artifact, maintenance
window and external secret-store reference. This runbook authorizes staging only.

## Procedure

1. Run `npm run security:staging-scan` and validate the rendered environment/Compose syntax.
2. Record redacted configuration summary and current `/ready` response.
3. Run backup job; verify non-zero encrypted archive, manifest checksum, application/commit/schema
   metadata and durable destination reference.
4. Run migration job once. On failure stop; preserve Prisma logs and do not resolve/reset schema.
5. Start document, embedding, notification, knowledge, Jira outbound and Jira inbound workers;
   check every matching-generation heartbeat and stale-job summary.
6. Deploy web; poll `/ready` with a bounded orchestration timeout.
7. For local simulation run `staging:smoke:local`. For managed staging run the read-only
   `staging:preflight:managed`, then only the separately approved synthetic provider smoke; never
   record the local test/fake-provider run as managed evidence.
8. Save correlation IDs, safe provider receipts, index generations and backup/migration evidence.
9. Reviewer confirms no blocker before marking successful.

## Failure

Pause affected worker generations, stop web rollout, keep database/object data, capture evidence and follow the
rollback runbook only if current schema is backward-compatible.

## Связанные документы

- [Staging deployment](../STAGING_DEPLOYMENT.md)
- [Staging rollback](./staging-rollback.md)
- [Managed staging governance](./managed-staging-governance.md)
