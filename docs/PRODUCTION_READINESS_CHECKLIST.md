# Production Readiness Checklist

Statuses are `Pending`, `Verified` or `Accepted risk`. Evidence must reference an
immutable CI artifact, release digest, runbook record or approved ticket.

| Area                             | Owner             | Status   | Blocking       | Evidence / verification                                                            |
| -------------------------------- | ----------------- | -------- | -------------- | ---------------------------------------------------------------------------------- |
| Infrastructure/network isolation | Platform          | Pending  | Yes            | Architecture review and private network test                                       |
| DNS/TLS                          | Platform/Security | Pending  | Yes            | External TLS scan                                                                  |
| Secrets and rotation             | Security          | Pending  | Yes            | `npm run production:config-check`                                                  |
| PostgreSQL/pgvector              | DBA               | Pending  | Yes            | migrations, capacity and PITR evidence                                             |
| Object storage                   | Platform          | Pending  | Yes            | private policy/versioning/backup evidence                                          |
| Redis queue/rate limit           | Platform          | Pending  | Yes            | queue integration and TLS/auth check                                               |
| Identity/MFA/session lifecycle   | Security          | Pending  | Yes            | TASK-009 migration, key rotation, admin enrollment and staging login/revoke smoke  |
| Document workers/OCR             | Operations        | Pending  | Yes            | heartbeat and real OCR smoke                                                       |
| Embedding workers                | Operations        | Pending  | Yes            | embedding/vector checks                                                            |
| Knowledge index workers          | Operations        | Pending  | Yes            | article index heartbeat, lifecycle and retrieval smoke                             |
| Notification workers             | Operations        | Pending  | Yes            | outbox heartbeat and approved-provider terminal receipt                            |
| Jira outbound/inbound workers    | Operations        | Pending  | Yes            | both heartbeats, backlog/DLQ and approved test-project evidence                    |
| AI providers                     | AI owner          | Pending  | Yes            | safe configuration/model/dimension check                                           |
| Backups                          | DBA/Platform      | Pending  | Yes            | `npm run backup:dry-run`, freshness                                                |
| Restore/DR                       | Incident owner    | Pending  | Yes            | isolated rehearsal and signed record                                               |
| Monitoring/traces                | SRE               | Pending  | Yes            | dashboards and collector smoke                                                     |
| Alerts/on-call                   | SRE               | Pending  | Yes            | alert delivery test                                                                |
| Budgets/rate limits              | Product/Finance   | Pending  | Yes            | cost/budget report and policy approval                                             |
| Security/dependencies            | Security          | Verified | No             | 2026-09-03 zero-finding npm audit and sequential fixable Critical/High image scans |
| Data protection/residency        | DPO/Security      | Pending  | Yes            | approved retention/residency review                                                |
| Incident response                | Incident owner    | Pending  | Yes            | tabletop exercise                                                                  |
| Migration/rollback               | Release owner     | Pending  | Yes            | migration rehearsal and rollback drill                                             |
| API/RAG smoke                    | QA                | Pending  | Yes            | health, retrieval, citation and no-leak tests                                      |
| Initial SLOs                     | Product/SRE       | Pending  | No until pilot | measured staging report                                                            |

## Go-live decision

Go-live is blocked while any blocking row is `Pending`. TASK-005 code/tests do not
replace environment-specific evidence, owner approval, production provider
validation or security acceptance.

## Dependency security status

The 2026-09-03 remediation supersedes the earlier temporary risk acceptances. The authoritative
`npm audit --omit=optional` reports zero vulnerabilities, the machine-readable acceptance file has
no active records, and sequential web/worker/migration/operations/OCR scans report no fixable
Critical/High findings. Details and retained historical context are in
[Dependency Security Review](./DEPENDENCY_SECURITY_REVIEW.md).

Any new dependency or OS-package finding reopens this row. Repository evidence does not replace an
SBOM and scan of the exact promoted release digest or approve production go-live.

## Repository quality remediation evidence

Targeted local/Docker validation on 2026-09-03 established the repository contracts required before
the next full release gate:

- repository-wide Prettier violations reduced from 35 files to zero;
- canonical local staging commands inject the real Git HEAD into matching Compose labels, runtime
  metadata and backup evidence; non-immutable staging/production evidence fails closed;
- containerized OCR passed 5/5 cases: PNG, scanned PDF, text-layer PDF bypass, controlled corrupt-PDF
  failure, timeout and temporary-file cleanup;
- pgvector exact passed Recall@K `1.0`, zero timeouts and zero tenant leakage; IVFFlat `0.1172` and
  HNSW `0.6448` remain `ANN NOT APPROVED / INFORMATIONAL`;
- the production Next.js build no longer infers its workspace root from an unrelated home-directory
  lockfile.

This is repository-level evidence only. It does not change any environment-specific `Pending` row,
approve managed staging, validate real providers or authorize production go-live.

## Smoke sequence

```bash
npm run production:config-check
npm run production:readiness
npm run queue:health-check
npm run workers:heartbeat-check
npm run ai:budget-check
npm run backup:status
```

`npm run staging:smoke:local` is local simulation evidence only. Managed staging starts with the
read-only `npm run staging:preflight:managed` contract and requires separately authorized provider
evidence; it cannot accept test Jira/notification or fake AI as success.

Perform one authorized document/OCR/embedding/RAG flow with non-sensitive staging
data, then verify citations, audit event, ledger entry and absence of content in
logs.

Identity staging evidence must separately confirm legacy credential migration,
admin TOTP enrollment before enforcement, recovery-code custody, password reset
delivery, session revoke/idle expiry and `MFA_ENCRYPTION_KEY` rotation procedure.
TASK-009 local tests do not mark this environment row `Verified`.

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
- [Authentication](./authentication.md)
- [TASK-005](./tasks/TASK-005.md)
- [TASK-009](./tasks/TASK-009.md)
