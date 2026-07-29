# Production Deployment

## Preconditions

- approved private PostgreSQL/pgvector, S3-compatible storage and Redis;
- secret manager values, TLS certificates and egress allowlists;
- current encrypted backups and successful restore rehearsal;
- reviewed migration and rollback plan;
- monitoring, alert routes and incident owner.

Use `.env.example` only as a list of placeholders. Do not commit environment files,
provider keys or production credentials.

## Images and processes

`docker/production.Dockerfile` contains `web`, `document-worker` and
`embedding-worker` targets. Runtime images use a non-root user; workers include
Tesseract/Poppler. Reference topology and resource/read-only/tmpfs settings are in
`docker-compose.production.example.yml`. Its backup job writes encrypted archives
to a dedicated persistent volume; production automation must transfer and verify
them in isolated immutable backup storage before marking the backup durable.
Only web and embedding workers join the reference egress network for AI provider
calls. A production deployment must replace unrestricted bridge egress with an
explicit provider/telemetry allowlist and keep PostgreSQL, Redis and object
storage on private networks.

Build locally without publishing:

```bash
docker build -f docker/production.Dockerfile --target web -t avantime-web:local .
docker build -f docker/production.Dockerfile --target document-worker -t avantime-document-worker:local .
docker build -f docker/production.Dockerfile --target embedding-worker -t avantime-embedding-worker:local .
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
npm run typecheck
npm run lint
npm run test
npm run build
npm run backup:dry-run
npm run production:readiness
```

Provider connectivity checks must be minimal and explicit. Paid generation calls
are prohibited without separate approval.

## Rolling deployment

1. Freeze destructive administration and verify backup timestamps.
2. Run migration job before application rollout.
3. Deploy Redis-compatible queue schema/application code.
4. Start new workers with unique `workerId`, version and generation.
5. Roll web nodes behind the load balancer.
6. Stop claims on old workers and let current jobs finish or leases expire.
7. Verify queues, heartbeat, OCR, vector/RAG, budget and audit state.
8. Record deployment evidence and release owner.

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
