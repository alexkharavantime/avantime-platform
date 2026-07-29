# Go-Live Checklist

Statuses are `pending`, `approved` or `rejected`. Codex and automation cannot
mark an approval; it must reference externally verified human evidence.

| Role                             | Name | Date | Environment | Evidence | Status  | Comments | Review date |
| -------------------------------- | ---- | ---- | ----------- | -------- | ------- | -------- | ----------- |
| Product Owner                    | —    | —    | —           | —        | pending | —        | —           |
| Technical Owner                  | —    | —    | —           | —        | pending | —        | —           |
| Security Owner                   | —    | —    | —           | —        | pending | —        | —           |
| Operations Owner                 | —    | —    | —           | —        | pending | —        | —           |
| Data Protection/Compliance Owner | —    | —    | —           | —        | pending | —        | —           |
| Business Owner                   | —    | —    | —           | —        | pending | —        | —           |

Before approval, verify the environment-specific rows in
[Production Readiness Checklist](./PRODUCTION_READINESS_CHECKLIST.md), scan
exceptions and expiry, rollback plan and immutable evidence checksum.

Current TASK-006 decision: `BLOCKED` because the managed environment, TLS,
provider, backup/restore, monitoring/alert and owner evidence are pending, and
11 production document-worker OCR-native findings have no Security Owner
acceptance.

## Related documents

- [Go-Live Evidence](./GO_LIVE_EVIDENCE.md)
- [Staging Operations](./STAGING_OPERATIONS.md)
- [TASK-006](./tasks/TASK-006.md)
