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

For managed staging, the additional TASK-014 boundary and preflight must pass before either dry-run
or execute. The independent reviewer verifies the exact target and evidence SHA. Provider delivery
and new-login observations are external gates; the durable inbox notification ID alone is not proof
of delivery. See [Managed staging validation](./MANAGED_STAGING_VALIDATION.md).

## Empty local development database

The governance command above intentionally does not create an identity and remains limited to
integration or staging. For the explicitly approved empty local database `avantime`, use the
local-only CLI:

1. Set `AUTH_ADMIN_MFA_REQUIRED=true` and provide local `MFA_ENCRYPTION_KEY`,
	`MFA_ENCRYPTION_KEY_VERSION`, `SESSION_SECRET` and `APP_URL`.
2. Run `npm run identity:first-owner -- prepare alexander@solutions.lv`. It creates one provisional
	`ADMIN` identity without a credential and writes a 30-minute password-activation link to a
	current-user-only local file. The token is stored in the database only as a hash.
3. The user opens that local file, chooses a password, enrolls TOTP and completes a fresh TOTP login.
4. Run `npm run identity:first-owner -- complete alexander@solutions.lv` within ten minutes of that
	login. The CLI calls the same owner bootstrap service, which rechecks the active MFA method,
	session, TOTP audit event and singleton ledger under the advisory lock.

This command is a local process, not an HTTP route. It rejects production, non-loopback databases,
any database other than `avantime`, any existing user/role/bootstrap, and execution without admin
MFA enforcement. Re-running preparation can only renew the token for the same uncredentialed
provisional identity; it cannot create another user. This local path does not replace the two-person
managed ceremony for integration/staging or the production identity ceremony.
