# Controlled approval workflow

Critical actions use an allowlisted policy plus a connected target resolver and atomic executor.
Registry-only actions cannot be requested. Request creation requires the action permission, MFA,
authentication within ten minutes, exact phrase, scope, complete safe parameters, resource
version and a canonical SHA-256 fingerprint. A request expires after ten minutes.

The requester cannot approve. A separately authenticated and authorized actor may approve or
reject; the requester may cancel while requested. Execution rechecks requester permission, MFA,
recent authentication, action, tenant, payload fingerprint, approver count and resource version.
It claims `APPROVED → EXECUTED` and invokes the action in the same transaction, so a failed action
rolls the claim back and a replay/concurrent call cannot repeat the side effect.

Connected actions are first/later owner assignment/removal, platform and organization audit
export, organization knowledge PUBLIC visibility, and destructive scoped support request status
change. Organization PUBLIC articles store the executed approval ID; a database constraint denies
PUBLIC without that evidence. Audit and notifications are part of the controlled transaction.

See [approval operations](./runbooks/approval-operations.md) and
[ADR-0030](./DECISIONS.md#adr-0030).
