# Staging Deployment

## Safe defaults

All commands are plan-only unless `--execute` and an exact environment-scoped
confirmation are supplied. `.env.staging.example` validates only the schema and
cannot deploy.

```bash
npm run staging:config-check -- --example
npm run staging:compose-check -- --example
npm run staging:deploy:plan -- --example
```

## Prepare an environment

1. Create a protected `.env.staging` from the example.
2. Allocate staging-only DNS, database, Redis, S3 and backup targets.
3. Mount secret files under `.staging-secrets` or bind an external provider to
   the `StagingSecretProvider` contract.
4. Record SHA-256 fingerprints of production secrets in the approved control
   plane and reject matching staging values.
5. Build images locally without publishing:

```bash
npm run staging:images:build
```

## Migration and deployment

```bash
npm run staging:migrate
STAGING_MIGRATION_CONFIRMATION="MIGRATE:staging-<id>" \
  npm run staging:migrate -- --execute

npm run staging:deploy
STAGING_DEPLOY_CONFIRMATION="DEPLOY:staging-<id>" \
  npm run staging:deploy -- --execute
```

The migration job validates configuration, requires a pre-migration backup in
the operational procedure, runs all additive migrations and must complete before
web/workers start. Repeated deploy is safe. Automatic destructive schema
rollback is forbidden; use the previous compatible application generation.

## External infrastructure steps

- Point the staging DNS record only after ingress is ready.
- Restrict public access to ports 80/443.
- Configure provider and telemetry egress allowlists.
- Enable database PITR and private object versioning/retention.
- Store evidence in an access-controlled immutable location.

No step in this guide authorizes production targets or paid provider calls.

## Related documents

- [Staging Architecture](./STAGING_ARCHITECTURE.md)
- [Staging Operations](./STAGING_OPERATIONS.md)
- [Backup and Restore](./BACKUP_RESTORE.md)
- [TASK-006](./tasks/TASK-006.md)
