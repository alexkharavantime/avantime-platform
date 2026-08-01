# First PLATFORM_OWNER bootstrap

The first platform owner is created only by `governance:bootstrap:*`; no browser value,
`User.role`, organization membership or identity-provider claim can authorize it. The command is
available only when `GOVERNANCE_OPERATION_ENVIRONMENT` and `DEPLOYMENT_ENVIRONMENT` are equal and
are `integration` or `staging`. Production is intentionally not accepted by this repository
command.

The operator identifies one active user by both ID and normalized email and supplies references to
an unrevoked session authenticated within ten minutes and its successful TOTP
`identity.login.success` event. An active MFA method, exact phrase
`BOOTSTRAP FIRST PLATFORM OWNER`, a change authorization ID, expiry no more than 15 minutes away,
and a high-entropy token matching the configured SHA-256 hash are required. Secrets are read from
environment/stdin-capable secret injection, never argv or evidence.

Dry-run applies the same policy and database evidence checks without mutation. Execute takes a
PostgreSQL transaction advisory lock, rechecks that no active owner and no bootstrap ledger exist,
then atomically creates the assignment, revokes target sessions, writes audit and notification,
and consumes the authorization into a hash-only singleton ledger. Any failure rolls the whole
transaction back. The unique singleton and authorization indexes make duplicate/concurrent calls
fail closed.

After success, remove the injected token/hash and run `governance:invariants`. Later owner changes
must use a second-person approval. Never delete or deactivate the last active owner automatically.

Execution details and failure recovery are in
[the bootstrap runbook](./runbooks/platform-owner-bootstrap.md) and
[the owner recovery runbook](./runbooks/platform-owner-recovery.md).
