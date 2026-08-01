# Runbook: scoped support session

## Prerequisites and actors

An active PLATFORM_SUPPORT/ADMIN actor has MFA/recent authentication, an approved ticket, exact
organization, reason code and minimum allowlisted scopes. Organization OWNER/ADMIN notification
delivery is available.

## Procedure and expected output

Create through the support-session API/UI, record returned ID/15-minute expiry, confirm the active
indicator, and test only the ticketed resource. Wrong tenant/scope and absent session must return
403/404. Destructive work additionally requires a distinct approval bound to session/resource
version. End through UI/API or use `governance:terminate-support` with exact phrase
`TERMINATE SUPPORT SESSION`; repeat termination is safely idempotent.

## Failure, rollback and escalation

Expired, ended, actor-mismatched or role-removed sessions deny. On suspected leakage, terminate,
revoke actor sessions/role as authorized, preserve audit and notify the tenant security contact.
Do not extend expiry or create tenant membership. Concurrent sessions are reviewed individually.

Evidence: hashed actor/company, reason/ticket, scopes, start/end audit, notification, negative
access results and sanitized indicator screenshot.
