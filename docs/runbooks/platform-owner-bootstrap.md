# Runbook: first PLATFORM_OWNER bootstrap

## Prerequisites and actors

Two operators validate the change ticket, target user ID/email and maintenance window. The target
must complete TOTP login immediately before the ceremony. Migrations must include
`20260802120000_governance_validation`; the environment is `integration` or managed `staging`.

## Commands and expected output

Inject `GOVERNANCE_OPERATION_ENVIRONMENT`, matching `DEPLOYMENT_ENVIRONMENT`, target/evidence IDs,
authorization ID/expiry, token and its SHA-256 through the approved secret channel. Set
`GOVERNANCE_CONFIRMATION="BOOTSTRAP FIRST PLATFORM OWNER"`.

1. `npm run governance:bootstrap:dry-run` → structured `passed`, no writes.
2. Reconfirm zero owners with `npm run governance:owners`.
3. `npm run governance:bootstrap:execute` → assignment/bootstrap/audit/notification IDs.
4. Remove injected token/hash, sign out/in, run `npm run governance:invariants`.
5. Export evidence and obtain reviewer sign-off.

## Failure, rollback and escalation

Wrong target/environment/phrase, expired authorization, missing MFA/session evidence, duplicate or
concurrent execution returns non-zero with a safe code. Audit or notification failure rolls back
the assignment. Do not retry with altered evidence: diagnose and issue a new authorization.
Successful bootstrap is not rolled back automatically; use the normal two-person owner workflow.
Never remove the last owner. Escalate an unavailable first owner via the recovery runbook.

Evidence: dry-run/execute JSON, migration, hashed actors, audit/notification IDs and invariant
bundle; never store token, cookie, email body or raw session value.
