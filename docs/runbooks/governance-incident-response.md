# Runbook: governance incident response

## Prerequisites and actors

Incident commander, security reviewer and domain owner establish a ticket, severity, affected
environment and evidence directory. Do not expose production credentials to repository tooling.

## Containment and expected output

Terminate suspect support sessions, revoke sessions/assignments through authorized paths, reject
or cancel pending approvals, stop publication/export executors, and preserve database/audit state.
Expired support sessions need no extension: verify denial and close them operationally if useful.
Notification failure is treated as ceremony failure; preserve transaction result and use the
approved out-of-band tenant/security channel. Audit-export failures require a new approval, never
an ungoverned export.

## Rollback and escalation

Use transaction rollback before completion and forward-fix/domain rollback afterward. Never
delete the last owner, bootstrap ledger, approval decisions or publication evidence. Restore from
backup only under disaster-recovery authority. Escalate self-approval, replay, cross-tenant reads,
missing audit or secret-bearing evidence immediately.

## Evidence collection

Run `governance:invariants`, then `governance:evidence` with explicit integration/staging,
correlation ID, commit SHA and a new `0600` file. Attach only sanitized screenshot/JSON references;
hash actor IDs and leave reviewer sign-off null until reviewed. Quarantine and replace any bundle
containing token, cookie, raw session, content, email body or provider claim.
