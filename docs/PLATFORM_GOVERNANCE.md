# Platform governance

## Authorization boundary

Platform roles are independent assignments: `PLATFORM_OWNER`, `PLATFORM_ADMIN`,
`PLATFORM_SUPPORT`, `PLATFORM_AUDITOR` and `PLATFORM_OPERATOR`. An assignment never creates or
changes `OrganizationMembership`; organization roles never authorize platform permissions.

The server reloads active assignments while resolving the opaque session. The central platform
service receives that validated session, a database assignment, an allowlisted permission and
optional operational/support context. Unknown role, permission, disabled assignment, actor
mismatch or missing context denies. Internal policy maps and reason codes are not returned to the
browser.

`PLATFORM_AUDITOR` is read-only. `PLATFORM_OPERATOR` is limited to jobs, health and document
operations. `PLATFORM_SUPPORT` can enter one server-validated company only through a short-lived
support session; it does not become a tenant member or impersonate an organization role.

Legacy `User.role=ADMIN` is intentionally not migrated into a platform assignment because the
field cannot distinguish a tenant administrator from a platform operator. For the first
`PLATFORM_OWNER`, two authorized operators use a controlled maintenance window: verify the exact
user and MFA evidence, record the change ticket, insert one assignment, revoke that user's active
sessions, retain database/audit evidence and validate the ordinary approval path immediately.
TASK-013 implements that boundary as an integration/staging-only controlled CLI with exact
ID/email, recent TOTP/session evidence, environment-bound single-use authorization, dry-run and a
hash-only singleton ledger. Assignment, session revocation, audit and notification share one
locked transaction. Later owner changes must use the application approval executor; neither organization role nor
identity-provider claims may bootstrap platform access.

## Support-session runbook

1. Verify an active platform assignment and `platform.support.session.start`.
2. Require MFA and authentication no older than ten minutes.
3. Resolve the organization in PostgreSQL; never trust it as ownership evidence.
4. Record an allowlisted reason code, ticket reference and exact support scopes.
5. Set a maximum 15-minute expiry and show it under `/portal/platform/support`.
6. Audit start/end and notify active organization OWNER/ADMIN users.
7. End manually when work is complete; expired/ended sessions deny automatically.
8. Use a separate controlled approval executor for destructive support actions.

The first connected destructive support executor is a version-fenced support-request status
change. Its approval binds the support-session ID, exact tenant request, next status and resource
version; the normal organization role is never changed.

Support sessions must not be reused as organization membership, bulk enumeration or silent
impersonation. Incident review uses `ProductionAuditEvent` and the support-session record; neither
contains request/document content, credentials or tokens.

## Role governance and emergency handling

Non-owner role assignment requires `platform.roles.manage`, MFA, recent authentication, exact
confirmation, optimistic assignment version, audit and target-session revocation. PLATFORM_OWNER
assignment/removal additionally requires an approved request from a different actor and protects
the last active owner.

If governance execution fails, do not edit rows manually. Preserve the approval and audit records,
revoke suspect sessions, investigate current resource version and create a new request. Expired,
rejected, cancelled and executed approvals cannot be replayed.

## Operational evidence

- `/portal/platform/roles` — active/disabled assignments and versions;
- `/portal/platform/audit` — platform audit evidence;
- `/portal/platform/support` — actor-owned live support sessions;
- `/portal/platform/approvals` — platform approval state;
- `/portal/platform/operations` — permission-protected operations entry point.

Repository evidence does not replace staging owner assignment, notification delivery and
break-glass drills.

## Связанные документы

- [TASK-012](./tasks/TASK-012.md)
- [TASK-013](./tasks/TASK-013.md)
- [TASK-014](./tasks/TASK-014.md)
- [Governance Bootstrap](./GOVERNANCE_BOOTSTRAP.md)
- [Governance Validation](./GOVERNANCE_VALIDATION.md)
- [Governance Sign-off](./GOVERNANCE_SIGNOFF.md)
- [Authorization Architecture](./AUTHORIZATION_ARCHITECTURE.md)
- [Security Hardening](./SECURITY_HARDENING.md)
- [ADR-0029](./DECISIONS.md#adr-0029)
