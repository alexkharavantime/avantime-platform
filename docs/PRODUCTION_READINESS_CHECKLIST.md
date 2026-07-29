# Production Readiness Checklist

Statuses are `Pending`, `Verified` or `Accepted risk`. Evidence must reference an
immutable CI artifact, release digest, runbook record or approved ticket.

| Area                             | Owner             | Status        | Blocking        | Evidence / verification                                                            |
| -------------------------------- | ----------------- | ------------- | --------------- | ---------------------------------------------------------------------------------- |
| Infrastructure/network isolation | Platform          | Pending       | Yes             | Architecture review and private network test                                       |
| DNS/TLS                          | Platform/Security | Pending       | Yes             | External TLS scan                                                                  |
| Secrets and rotation             | Security          | Pending       | Yes             | `npm run production:config-check`                                                  |
| PostgreSQL/pgvector              | DBA               | Pending       | Yes             | migrations, capacity and PITR evidence                                             |
| Object storage                   | Platform          | Pending       | Yes             | private policy/versioning/backup evidence                                          |
| Redis queue/rate limit           | Platform          | Pending       | Yes             | queue integration and TLS/auth check                                               |
| Document workers/OCR             | Operations        | Pending       | Yes             | heartbeat and real OCR smoke                                                       |
| Embedding workers                | Operations        | Pending       | Yes             | embedding/vector checks                                                            |
| AI providers                     | AI owner          | Pending       | Yes             | safe configuration/model/dimension check                                           |
| Backups                          | DBA/Platform      | Pending       | Yes             | `npm run backup:dry-run`, freshness                                                |
| Restore/DR                       | Incident owner    | Pending       | Yes             | isolated rehearsal and signed record                                               |
| Monitoring/traces                | SRE               | Pending       | Yes             | dashboards and collector smoke                                                     |
| Alerts/on-call                   | SRE               | Pending       | Yes             | alert delivery test                                                                |
| Budgets/rate limits              | Product/Finance   | Pending       | Yes             | cost/budget report and policy approval                                             |
| Security/dependencies            | Security          | Accepted risk | No for TASK-005 | `AR-DEP-2026-001/002`; review 2026-08-12; SBOM/image scan remains go-live evidence |
| Data protection/residency        | DPO/Security      | Pending       | Yes             | approved retention/residency review                                                |
| Incident response                | Incident owner    | Pending       | Yes             | tabletop exercise                                                                  |
| Migration/rollback               | Release owner     | Pending       | Yes             | migration rehearsal and rollback drill                                             |
| API/RAG smoke                    | QA                | Pending       | Yes             | health, retrieval, citation and no-leak tests                                      |
| Initial SLOs                     | Product/SRE       | Pending       | No until pilot  | measured staging report                                                            |

## Go-live decision

Go-live is blocked while any blocking row is `Pending`. TASK-005 code/tests do not
replace environment-specific evidence, owner approval, production provider
validation or security acceptance.

## Dependency security acceptance

On 2026-07-29 the authoritative npm audit was classified in
[Dependency Security Review](./DEPENDENCY_SECURITY_REVIEW.md). There are no
critical findings and no unaccepted high production-runtime risks.

- `AR-DEP-2026-001`: accepted development/build lint-chain risk.
- `AR-DEP-2026-002`: accepted unreachable PostCSS/Sharp production-image risk.
- Acceptance expires on `2026-08-12`.
- A change that introduces runtime CSS processing, Next image optimization,
  direct Sharp use, untrusted glob patterns or public image inputs immediately
  reopens this blocking row.

This acceptance completes the TASK-005 dependency-review gate. It does not accept
OS package findings, replace SBOM/image scanning, or approve production go-live.

## Smoke sequence

```bash
npm run production:config-check
npm run production:readiness
npm run queue:health-check
npm run workers:heartbeat-check
npm run ai:budget-check
npm run backup:status
```

Perform one authorized document/OCR/embedding/RAG flow with non-sensitive staging
data, then verify citations, audit event, ledger entry and absence of content in
logs.

## Рекомендации по улучшению

- Replace role labels with named owners before staging approval.
- Store evidence outside the repository with retention and access control.
- Review checklist after every architecture or provider change.

## Связанные документы

- [Production Architecture](./PRODUCTION_ARCHITECTURE.md)
- [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
- [Backup and Restore](./BACKUP_RESTORE.md)
- [Disaster Recovery](./DISASTER_RECOVERY.md)
- [Observability](./OBSERVABILITY.md)
- [Security Hardening](./SECURITY_HARDENING.md)
- [Dependency Security Review](./DEPENDENCY_SECURITY_REVIEW.md)
- [TASK-005](./tasks/TASK-005.md)
