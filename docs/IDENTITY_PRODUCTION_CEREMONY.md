# Identity Production Ceremony

This runbook is an environment gate for TASK-009. Do not put keys, recovery codes, provider tokens
or screenshots containing them in Git, CI logs or the evidence package.

## Owners and prerequisites

The Security Owner approves the ceremony; the Platform Owner performs secret-manager and
deployment steps; the designated first `ADMIN` performs enrollment. Use a production-like staging
environment first. PostgreSQL, Redis, HTTPS origin, identity email delivery and audit storage must
already be healthy.

## Procedure

1. Generate a 32-byte random MFA encryption key on an approved administrator workstation. Do not
   paste it into a shell history, ticket or repository.
2. Store the value in the approved secret manager. Record only the opaque reference and a new
   non-secret version such as `2026-07-identity-v1`.
3. Inject `MFA_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY_VERSION`, `SESSION_SECRET`,
   `IDENTITY_EMAIL_DRIVER=resend`, `RESEND_API_KEY`, `MAIL_FROM`, `AUTH_PUBLIC_ORIGIN` and
   `AUTH_ADMIN_MFA_REQUIRED=true` through the deployment secret boundary.
4. Run the production configuration check. Capture the command, deployment revision, timestamp and
   pass/fail result, but no environment values.
5. Have the designated first `ADMIN` enroll TOTP and store recovery codes in the approved personal
   secure store. Evidence records only completion.
6. Confirm ADMIN MFA enforcement with a fresh session and verify an invalid OTP is denied.
7. Revoke one disposable session and then all other disposable sessions. Record the audit event
   references.
8. Perform the approved account-recovery drill with a disposable recovery code and confirm reuse is
   denied.
9. Exercise emergency revoke for a designated test identity and verify active sessions stop
   resolving.
10. Run `npm run identity:ceremony-check` in the controlled environment with the non-secret evidence
    references below.
11. Security Owner reviews the evidence and records approval outside the repository.

## Automated guard inputs

- `IDENTITY_CEREMONY_ENVIRONMENT=staging|production`
- `IDENTITY_SECRET_MANAGER_REFERENCE` — opaque secret-manager path/reference
- `MFA_ENCRYPTION_KEY_VERSION` — non-secret version
- `IDENTITY_FIRST_ADMIN_ENROLLED=true`
- `AUTH_ADMIN_MFA_REQUIRED=true`
- `IDENTITY_EMERGENCY_REVOKE_DRILL_ID` — safe evidence ID
- `IDENTITY_RECOVERY_DRILL_ID` — safe evidence ID
- `IDENTITY_SECURITY_OWNER_APPROVAL` — safe approval reference
- `MFA_ENCRYPTION_KEY` — injected at runtime and never printed

## Evidence template

```text
Environment:
Deployment revision:
Started/finished UTC:
Platform Owner:
Security Owner:
Secret-manager reference:
MFA key version:
Production configuration check result:
First ADMIN enrollment evidence ID:
ADMIN enforcement evidence ID:
Emergency revoke drill ID:
Recovery/reuse-denial drill ID:
Audit query evidence ID:
Security Owner approval reference:
Open exceptions:
```

## Failure and rollback

Stop promotion if a key is missing, a secret appears in logs, ADMIN enforcement fails, recovery
code reuse succeeds, revoke does not invalidate the session, audit evidence is missing, or owner
approval is absent. Revoke exposed values in the provider/secret manager, rotate to a new version,
invalidate sessions and repeat the ceremony. Database down-migration is not the rollback mechanism.
