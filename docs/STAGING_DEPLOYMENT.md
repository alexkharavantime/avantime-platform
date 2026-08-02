# Staging deployment

## Preconditions

- approved commit SHA and immutable image tag;
- rendered environment outside Git from an approved secret store;
- isolated staging database, Redis namespace and private bucket;
- compatible previous artifact recorded;
- operator/reviewer and maintenance window identified;
- production environment and credentials absent.

Validate without changing external state:

```bash
npm run security:staging-scan
npm run staging:config-check
docker compose --env-file "$STAGING_ENV_FILE" -f docker-compose.staging.yml config --quiet
npm run staging:migration-status
```

The migration status command is expected to fail before a deployment that contains a pending
migration. A failed/incomplete migration is a blocker and must not be resolved as applied without
evidence.

## Local staging simulation

```bash
cp .env.staging.local.example .env.staging
npm run staging:up
npm run staging:smoke
npm run staging:restore-rehearsal
npm run staging:down
```

`.env.staging` is ignored/untracked and disposable. Local success proves Compose contracts only;
it does not prove managed provider readiness.

## Managed deploy sequence

1. Build all targets from `docker/production.Dockerfile`; publish immutable digests.
2. Record `APP_VERSION`, `COMMIT_SHA`, `MIGRATION_VERSION` and previous image digests.
3. Render environment from secret store and run configuration/manifest preflight.
4. Run encrypted PostgreSQL backup and private object inventory; verify checksums and durable copy.
5. Run the one-shot migration service. Stop on non-zero exit; never reset the database.
6. Start/update notification, knowledge and Jira workers; require matching-generation heartbeats.
7. Update web and wait for `/ready`.
8. Run the staging smoke suite and targeted browser smoke.
9. Preserve redacted logs, backup manifest, migration result, readiness report and smoke evidence.

On a completely empty database the migration image creates only the historical account-schema
foundation that predates the repository's first Prisma migration, then runs the full immutable
migration chain. It refuses a non-empty database without `_prisma_migrations` and refuses an
incomplete versioned database; it never seeds users or customer data. 10. Independent reviewer records managed validation; only then mark deployment successful.

Example orchestration (operator supplies a secret-managed environment path):

```bash
docker compose --env-file "$STAGING_ENV_FILE" -p avantime-staging \
  -f docker-compose.staging.yml run --rm backup
docker compose --env-file "$STAGING_ENV_FILE" -p avantime-staging \
  -f docker-compose.staging.yml run --rm migration
docker compose --env-file "$STAGING_ENV_FILE" -p avantime-staging \
  -f docker-compose.staging.yml up -d --wait notification-worker knowledge-index-worker jira-worker web
```

## Failure handling

Stop rollout, preserve evidence and keep the migrated database. Do not run `reset`, `dropdb`,
`TRUNCATE` or automatic down migration. If schema is backward-compatible, use the rollback runbook
with the previous artifact. Otherwise pause workers, disable affected feature flags and escalate to
a forward-fix decision.

## Связанные документы

- [Staging infrastructure](./STAGING_INFRASTRUCTURE.md)
- [Staging deploy runbook](./runbooks/staging-deploy.md)
- [Staging rollback runbook](./runbooks/staging-rollback.md)
- [Backup and restore](./BACKUP_RESTORE.md)
- [Production deployment](./PRODUCTION_DEPLOYMENT.md)
- [Jira worker runbook](./runbooks/jira-worker.md)
- [TASK-016](./tasks/TASK-016.md)
