# Disaster Recovery

## Common incident flow

For every scenario: declare incident and owner, contain writes/egress, preserve
evidence, recover into an isolated boundary, verify tenant/data integrity, decide
rollback, communicate impact and record audit/recovery events.

| Scenario            | Detection and containment                      | Recovery and verification                                                                 | Expected loss                                    |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Database loss       | DB/health alerts; stop writes/workers          | PITR or latest dump into isolated DB; migrations/counts/tenant checks; controlled cutover | Up to approved DB RPO                            |
| Object storage loss | read/checksum failures; stop processing/delete | Restore versioned/replicated objects; compare manifest/count/size/checksums               | Up to object RPO                                 |
| Queue loss          | Redis alerts/queue mismatch; stop enqueue      | Restore Redis if valid, then reconcile non-terminal PostgreSQL state                      | Duplicate work possible; source data retained    |
| AI provider outage  | latency/error alerts; block provider route     | Keep reservations released, use approved provider policy only; smoke configuration        | No document loss; AI unavailable                 |
| OCR outage          | OCR readiness/latency; stop OCR claims         | Roll back runtime image or repair Tesseract/Poppler; process one safe sample              | Jobs delayed                                     |
| Corrupted migration | migration gate/DB errors; stop rollout         | Previous app with additive schema or isolated backup restore; verify migration history    | Depends on transaction/backup                    |
| Partial deployment  | generation/heartbeat mismatch; halt rollout    | Drain new workers, route previous web, let leases expire                                  | Duplicate work tolerated                         |
| Region outage       | multi-service alerts; activate DR owner        | Restore replicated DB/objects/config in secondary region; validate DNS/TLS                | Up to RPO; RTO unverified                        |
| Leaked secret       | security alert; disable credential/egress      | Rotate secret, invalidate sessions, scan audit/logs, redeploy                             | Investigate exposure window                      |
| Runaway AI cost     | budget/rate alerts; hard stop                  | Disable affected provider/tenant, expire reservations, reconcile ledger                   | Financial exposure up to hard-stop race boundary |
| Vector corruption   | recall/SQL/index alerts; disable semantic mode | Rebuild vectors from stored chunks/model version; exact search until verified             | Search degraded, source retained                 |

## Communication

Incident communication must state affected tenant/service/time window, current
containment, expected recovery and data-loss estimate. It must not include
document content, credentials, raw provider errors or other tenants.

## Return-to-service checks

- configuration and secrets validated;
- tenant isolation and checksum samples pass;
- queue fences/heartbeats healthy;
- OCR and embedding/RAG smoke checks pass;
- budget/ledger/audit available;
- backups restarted and next rehearsal scheduled;
- rollback path remains available.

## Рекомендации по улучшению

- Assign named on-call and business owners in the go-live checklist.
- Rehearse one scenario per quarter and record measured RPO/RTO.
- Add region failover only after data residency and cost approval.

## Связанные документы

- [Backup and Restore](./BACKUP_RESTORE.md)
- [Queue Operations](./QUEUE_OPERATIONS.md)
- [Observability](./OBSERVABILITY.md)
- [Security Hardening](./SECURITY_HARDENING.md)
- [Production Readiness Checklist](./PRODUCTION_READINESS_CHECKLIST.md)
