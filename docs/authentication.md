# Production identity, authentication and sessions

TASK-009 replaces the signed profile cookie with an opaque, server-side identity boundary while
preserving the existing `CLIENT`/`ADMIN` business roles and portal routes.

## Identity model

`User` is a global person/account record. Authentication sources are separate:

- `UserCredential.identifierNormalized` is unique only for local password authentication;
- `ExternalIdentity` is unique by `(providerId, subject)`;
- `IdentityProvider` represents disabled-by-default OIDC/SAML foundations without storing client
  secrets;
- provider-asserted email is metadata and never links identities automatically;
- `OrganizationMembership` grants tenant access independently from identity linking;
- deleting or disabling a membership does not delete the identity;
- legacy `User.companyId` remains a compatibility projection for the current single-company
  portal and is not accepted from client input.

If a user has several active memberships and no server-controlled compatibility membership can
be selected, `CLIENT` login is denied. A future tenant selector must be a separate server-side
flow; TASK-009 does not introduce client-provided tenant selection.

## Local passwords

New passwords use a versioned scrypt hash with a random 128-bit salt and centralized parameters.
Legacy PBKDF2-SHA256 hashes remain verifiable and are replaced with the current scrypt format after
the next successful login. `User.passwordHash` is compatibility-only; migration copies existing
values to `UserCredential` and clears the legacy field.

Argon2id was considered, but the first foundation uses Node.js built-in scrypt to avoid adding a
native runtime/dependency boundary during the production container hardening phase. Moving to
Argon2id remains possible through the versioned hash contract.

Password policy:

- 12–128 characters;
- local denylist for common passwords;
- normalized email/local part cannot be used as the password;
- no scheduled password expiry or obsolete composition rules;
- no password or hash is sent to an external compromised-password provider;
- policy errors are server-side and do not expose hash parameters.

Unknown users and wrong passwords return the same response. Unknown-user work executes the same
current KDF against a dummy hash. Malformed/oversized hashes and passwords are bounded before
expensive work.

## Login flow

1. The mutation must have an allowed same-origin `Origin` in production.
2. The normalized local identifier and coarse IP subject are independently rate-limited;
   production uses authenticated Redis and
   fails closed when the limiter is unavailable.
3. The password credential, active user and server-side membership are verified.
4. If MFA is active or required, a five-minute random pre-auth token is returned. Only its
   SHA-256 hash and an allowlisted `returnTo` are stored in PostgreSQL.
5. TOTP or a recovery code consumes the challenge once.
6. Only after all required factors succeed is a new opaque session created. Any previous cookie
   presented to login is revoked and the session identifier is rotated.

Demo identities remain explicitly opt-in with `ENABLE_DEMO_AUTH=true` and cannot run in
production. A configured but unavailable PostgreSQL database never falls back to demo auth.

## MFA

The first factor implementation is TOTP:

- 160-bit random secret;
- AES-256-GCM encryption at rest with a distinct `MFA_ENCRYPTION_KEY`;
- pending enrollment expires after ten minutes and does not count as enabled;
- confirmation requires a valid six-digit OTP;
- one 30-second step of clock skew is allowed;
- the last used counter is persisted and the same OTP cannot be replayed;
- MFA mutations and challenges are rate-limited and audited.

Recovery codes are random one-time values. They are returned only during initial confirmation or
explicit regeneration, stored only as SHA-256 hashes, and consumed transactionally. Regeneration
deletes the previous batch. Use creates a security event and a generic tenant-scoped
notification; the code is never logged.

`MfaMethodKind` reserves `WEBAUTHN` and `IDP_CLAIM` without claiming they are implemented. SMS is
not used as a required factor.

## Tenant-aware MFA policy

`OrganizationIdentityPolicy` supports:

- `OPTIONAL`;
- `ADMINS`;
- `ALL_MEMBERS`;
- an enforcement date and bounded grace period;
- explicit, expiring `OrganizationMfaExemption` records approved by an administrator.

Policy is loaded from the membership selected by the server. Identity mutation routes reject
`companyId`, `organizationId` and `tenantId`. Production configuration requires
`AUTH_ADMIN_MFA_REQUIRED=true`; tenant policy changes use the company already present in a
validated administrator session and are audited.

MFA cannot be disabled while the effective policy requires it. Disabling/resetting MFA revokes
all sessions.

## Sessions

The cookie contains only a 256-bit random opaque token. PostgreSQL stores only its SHA-256 hash
and the following minimized lifecycle data:

- user and server-selected company IDs;
- creation, last activity, authentication, idle and absolute expiry times;
- revocation and rotation references;
- coarse browser/platform label.

No IP address, fingerprint, raw user-agent, email, name or tenant data is embedded in the cookie.
Cookie policy is `HttpOnly`, `SameSite=Lax`, `Secure` in production, host-only and `Path=/`.
Absolute lifetime is eight hours and inactivity timeout is thirty minutes. Activity extension
never exceeds absolute expiry.

Session validation re-checks active user, role and membership. A disabled user or removed
membership is denied even if the record has not yet been physically cleaned up. Password reset,
password change and MFA reset revoke sessions. `/portal/settings/security` lists minimized
sessions and supports revoking one or all other sessions.

## Reset, verification, invitation and security telemetry

Reset tokens are 256-bit random values stored only as SHA-256 hashes, expire after 30 minutes and
are consumed once. New issuance invalidates previous unused tokens. The external response is the
same whether an account exists or not. A successful reset applies the current password policy,
updates `UserCredential`, consumes all reset tokens and revokes all sessions in one transaction.

Identity security actions write allowlisted `SecurityEvent` and production audit entries with
correlation ID, server-derived user/tenant IDs, result and minimal method/reason/session metadata.
They never contain identifier/email, password/hash, TOTP secret/code, recovery/reset token, URL,
provider claims or raw errors. Audit follows the existing fail-open telemetry policy; credential,
session and token state changes themselves remain transactional.

Email verification uses the same random/hash/TTL/single-use pattern, a generic resend response and
an allowlisted local redirect. Existing users are backfilled verified to preserve access; new and
invited identities follow staged verification. Team invitations are tenant-bound, expire after 72
hours, fix the grant to `CLIENT`, create no membership before authenticated acceptance and may be
revoked.

Production identity messages contain a one-time code rather than a link with a token. They are sent
only through `IDENTITY_EMAIL_DRIVER=resend`. Tests and development neither send nor log the code or
recipient.

## Enterprise OIDC foundation

Provider profiles cover Microsoft Entra ID, Google Workspace and generic OIDC using issuer, client
ID, secret-manager reference, discovery/authorization/token/JWKS endpoints, exact redirect,
allowed domains and mapping metadata. The validator enforces Authorization Code Flow, S256 PKCE,
state, nonce, RS256/JWKS signature, issuer, audience, `exp`/`nbf`, `email_verified` and replay
protection. A deterministic mock IdP is the only validated provider.

Linking requires recent reauthentication and a validated assertion; email match alone is rejected.
Unlinking requires step-up and cannot remove the last login method. No real provider callback or
tenant validation is claimed.

## Production configuration

Required identity settings:

```text
DATABASE_URL=postgresql://...?...sslmode=verify-full
REDIS_URL=rediss://...:...@...
SESSION_SECRET=<at least 32 characters>
MFA_ENCRYPTION_KEY=<base64url-encoded 32 bytes>
MFA_ENCRYPTION_KEY_VERSION=<non-secret version>
AUTH_PUBLIC_ORIGIN=https://portal.example.com
AUTH_ADMIN_MFA_REQUIRED=true
IDENTITY_EMAIL_DRIVER=resend
MAIL_FROM=security@portal.example.com
RESEND_API_KEY=<secret-manager value>
```

`MFA_ENCRYPTION_KEY` must be generated and delivered through the approved secret manager. It must
not be reused as `SESSION_SECRET` or committed to Git.

## Known foundation boundaries

- OIDC provider records, validator/mock and safe `(provider, subject)` linking contract exist, but
  no provider is enabled, no production callback is implemented and no real tenant is validated.
- WebAuthn/passkeys and IdP MFA claims are reserved model kinds, not active factors.
- Current portal roles remain `CLIENT` and `ADMIN`; TASK-009 does not implement the broader RBAC
  matrix or a multi-tenant selector.
- Production ceremony, first ADMIN enrollment, revoke/recovery drills and Security Owner approval
  are required by [Identity Production Ceremony](./IDENTITY_PRODUCTION_CEREMONY.md).

## Related documents

- [ADR-0026](./DECISIONS.md#adr-0026)
- [Identity Architecture](./IDENTITY_ARCHITECTURE.md)
- [Identity Production Ceremony](./IDENTITY_PRODUCTION_CEREMONY.md)
- [Portal Architecture](./PORTAL_ARCHITECTURE.md)
- [Security Hardening](./SECURITY_HARDENING.md)
- [Testing](./TESTING.md)
- [TASK-009](./tasks/TASK-009.md)
