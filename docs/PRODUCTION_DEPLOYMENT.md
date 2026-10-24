# Production Deployment

## Preconditions

- approved private PostgreSQL/pgvector, S3-compatible storage and Redis;
- secret manager values, TLS certificates and egress allowlists;
- current encrypted backups and successful restore rehearsal;
- reviewed migration and rollback plan;
- monitoring, alert routes and incident owner.

Use `.env.example` only as a list of placeholders. Do not commit environment files,
provider keys or production credentials.

Deployment environment must inject `APP_VERSION`, the full 40-character `COMMIT_SHA` and
`MIGRATION_VERSION` from the immutable artifact pipeline. Container labels, runtime readiness and
backup manifests must report the same values. Managed staging and production backup evidence fail
closed for a missing, local-marker or otherwise non-immutable commit SHA.

## Images and processes

`docker/production.Dockerfile` contains `web`, `migration`, `document-worker`,
`embedding-worker`, `knowledge-index-worker`, `notification-worker`, `jira-worker`,
`jira-inbound-worker` and `operations` targets. Runtime images use a non-root user; workers include
Tesseract/Poppler. Reference topology and resource/read-only/tmpfs settings are in
`docker-compose.production.example.yml`. Its backup job writes encrypted archives
to a dedicated persistent volume; production automation must transfer and verify
them in isolated immutable backup storage before marking the backup durable.
Only processes that call approved external providers join the reference egress network. A
production deployment must replace unrestricted bridge egress with an
explicit provider/telemetry allowlist and keep PostgreSQL, Redis and object
storage on private networks.

Build locally without publishing:

```bash
docker build -f docker/production.Dockerfile --target web -t avantime-web:local .
docker build -f docker/production.Dockerfile --target document-worker -t avantime-document-worker:local .
docker build -f docker/production.Dockerfile --target embedding-worker -t avantime-embedding-worker:local .
docker build -f docker/production.Dockerfile --target knowledge-index-worker -t avantime-knowledge-worker:local .
docker build -f docker/production.Dockerfile --target notification-worker -t avantime-notification-worker:local .
docker build -f docker/production.Dockerfile --target jira-worker -t avantime-jira-worker:local .
docker build -f docker/production.Dockerfile --target jira-inbound-worker -t avantime-jira-inbound-worker:local .
docker build -f docker/production.Dockerfile --target migration -t avantime-migration:local .
docker build -f docker/production.Dockerfile --target operations -t avantime-operations:local .
```

Generate an SBOM and scan the actual release digest with approved tooling, for
example Syft/Trivy, before promotion. Never treat a successful image build as a
vulnerability scan.

## Pre-deploy gates

```bash
npm run production:config-check
npm run db:generate
npx prettier --check .
npm run typecheck
npm run lint
npm run test
npm run test:ocr-integration:docker
npm run pgvector:load-test -- --integration
npm run build
npm run backup:dry-run
npm run production:readiness
```

Provider connectivity checks must be minimal and explicit. Paid generation calls
are prohibited without separate approval.

The Next.js monorepo root is resolved relative to the repository config through
`outputFileTracingRoot`/`turbopack.root`; builds must not infer their trace boundary from unrelated
lockfiles in a developer home directory.

## Rolling deployment

1. Freeze destructive administration and verify backup timestamps.
2. Run migration job before application rollout.
3. Deploy Redis-compatible queue schema/application code.
4. Start document, embedding, knowledge, notification and both Jira workers with unique
   `workerId`, version and generation.
5. Roll web nodes behind the load balancer.
6. Stop claims on old workers and let current jobs finish or leases expire.
7. Verify queues, heartbeat, OCR, vector/RAG, budget and audit state.
8. Record deployment evidence and release owner.

## One-time PasswordResetToken reconciliation

Migration `20260930130000_password_reset_tokens` creates `"PasswordResetToken"`. Databases
created from the historical account baseline already contain that table, so
`prisma migrate deploy` stops with `P3018` / `relation "PasswordResetToken" already exists`.
Staging (`docker/run-staging-migrations.sh`), the migration rehearsal and the browser fixture
perform the reconciliation below automatically; production requires it once, before step 2.

Conditions — all must hold, otherwise do not reconcile:

- a verified backup of the target database exists;
- `_prisma_migrations` has no finished, non-rolled-back row for
  `20260930130000_password_reset_tokens` (a failed attempt may be present);
- the existing table matches the migration exactly. The check is
  `packages/database/prisma/reconciliation/20260930130000_password_reset_tokens.sql`; it changes
  nothing and reports `AVANTIME_RECONCILE_NOT_REQUIRED` (migration recorded or table absent) or
  `AVANTIME_RECONCILE_MISMATCH` (columns, constraints or unique indexes differ).

Procedure, run against the target database with the migration image:

```bash
prisma db execute --file packages/database/prisma/reconciliation/20260930130000_password_reset_tokens.sql --schema packages/database/prisma/schema.prisma
# only when the check above succeeded:
prisma migrate resolve --applied 20260930130000_password_reset_tokens --schema packages/database/prisma/schema.prisma
prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

Verification: `prisma migrate status` reports no pending or failed migrations, the reset-token
row count is unchanged, and running the check again reports `AVANTIME_RECONCILE_NOT_REQUIRED`.
On `AVANTIME_RECONCILE_MISMATCH`, stop and review the table manually; never edit the migration
file or the checksums in `_prisma_migrations`.

## Rollback

- Stop new workers from claiming jobs.
- Route traffic to the previous compatible web image.
- Run the previous worker generation; expired leases recover automatically.
- Do not remove additive columns/tables during incident rollback.
- If data is corrupted, follow the isolated restore/DR runbook and require explicit
  target confirmation.

## Runtime hardening

- read-only root filesystem where supported;
- writable `tmpfs` only for OCR temporary files;
- no privileged mode, host network, Docker socket or extra capabilities;
- CPU/memory/PID limits and graceful termination period longer than active lease;
- internal health probes; detailed diagnostics restricted to administrators;
- secrets mounted/injected at runtime, never baked into images.

## Рекомендации по улучшению

- Pin release images by digest after the first validated build.
- Automate canary and rollback evidence in the chosen deployment platform.
- Validate resource limits using production-like OCR and vector workloads.

## Связанные документы

- [Production Architecture](./PRODUCTION_ARCHITECTURE.md)
- [Production Readiness Checklist](./PRODUCTION_READINESS_CHECKLIST.md)
- [Security Hardening](./SECURITY_HARDENING.md)
- [Backup and Restore](./BACKUP_RESTORE.md)
- [Disaster Recovery](./DISASTER_RECOVERY.md)
