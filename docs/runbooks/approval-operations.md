# Runbook: controlled approvals

## Prerequisites and actors

Requester and distinct approver each have current action permission, MFA/recent authentication and
understand the exact confirmation phrase. Resolve current tenant/resource/version first.

## Procedure and expected output

Create the request, capture ID/fingerprint/expiry, verify self-approval denial, obtain the second
decision, and execute once before expiry. Confirm the exact audit and notification records and
verify replay returns denial. Use `governance:approvals` to inspect and
`governance:expire-approvals` with `EXPIRE STALE APPROVALS` for stale rows.

Audit export uses a bounded date range and JSON; never place exported records in the general
evidence bundle. Stuck requests are rejected/cancelled/expired, never edited. Registry-only actions
must fail before persistence.

## Failure, rollback and escalation

Reject on wrong target, permission removal, payload/version drift or notification/audit failure.
Atomic executor failure restores APPROVED state; investigate and create a fresh request when state
changed. A completed action uses its domain rollback, not approval replay. Escalate suspected
self-approval/replay immediately and preserve immutable evidence.

Evidence: hashed actors, policy/action, fingerprint, expected/current version, decisions,
execution/audit/notification IDs and outcome.
