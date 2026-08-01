# Runbook: PLATFORM_OWNER recovery

## Prerequisites and actors

Security incident commander and two authorized operators verify active owner count, user/session
state, audit trail and ticket. Bootstrap is not a recovery mechanism once its ledger exists.

## Procedure and expected output

Use `governance:owners` and audit read access. If one owner remains available, create a normal
`PLATFORM_OWNER_ASSIGN` request, obtain a distinct approver, execute once, confirm session
invalidation, then remove/disable the unavailable owner only after at least two active owners are
verified. Expected output is one executed approval and owner count never below one.

## Failure, rollback and escalation

Reject/cancel/expire stale requests; create a new fingerprint after any version change. Never edit
the bootstrap ledger, infer an owner from legacy ADMIN, delete the last assignment or run direct
SQL. If no owner can authenticate, freeze platform-role changes and escalate to the formally
approved database recovery authority; preserve snapshots and evidence. Recovery is manual and is
not automated by TASK-013.

Evidence: ticket, hashed actors, before/after owner list, approval/audit/notification IDs and
reviewer sign-off.
