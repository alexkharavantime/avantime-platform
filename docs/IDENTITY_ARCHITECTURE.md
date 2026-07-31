# Production Identity Architecture

TASK-009 introduces a server-side identity boundary without expanding the existing
`CLIENT`/`ADMIN` authorization model. Identity proves who a person is; an active
`OrganizationMembership` grants tenant access. External identity linking never creates a
membership.

## Identity and session model

- `UserCredential` owns the normalized local identifier and versioned password hash.
- `ExternalIdentity` is unique by `(providerId, subject)`; matching email alone is never a linking
  signal.
- `IdentityProvider` stores provider-neutral OIDC metadata and a secret-manager reference, never a
  client secret.
- `UserSession` stores only a hash of an opaque browser token and enforces idle, absolute, revoke
  and rotation rules.
- `OrganizationIdentityPolicy` applies tenant MFA requirements using only server-derived company
  context.

Legacy PBKDF2 hashes are copied into the local credential and upgraded to versioned scrypt only
after a successful login. Existing users are backfilled as email-verified so rollout does not
silently remove access. New local and invited identities must complete verification before the
relevant access transition.

## Local recovery and verification

Password-reset and email-verification codes are 256-bit random values. Only SHA-256 digests are
stored. Each code has a 30-minute TTL, is single-use, and replaces earlier active codes. Responses
are identical for known and unknown identifiers. Identifier and coarse IP subjects have separate
distributed limits. Successful password reset revokes all user sessions.

Production delivery uses `IDENTITY_EMAIL_DRIVER=resend`; startup requires a non-default API key and
sender. Tests and development do not send or log real messages. Codes are submitted in POST bodies,
not URLs. Redirects use the local allowlist in `safeReturnTo`.

## MFA and key management

TOTP secrets and OIDC PKCE verifiers use AES-256-GCM with authenticated context. Ciphertext carries
an explicit `MFA_ENCRYPTION_KEY_VERSION`; a JSON map of previous versions supports controlled
read-during-rotation. Production has no default key and fails closed when the current key,
version, trusted origin, PostgreSQL, Redis or ADMIN MFA guard is absent. Recovery codes are random,
shown once and stored only as hashes. A persisted TOTP counter prevents replay.

Rotation procedure:

1. generate a new 32-byte key outside the repository;
2. place it in the approved secret manager under a new version;
3. expose the old version through `MFA_ENCRYPTION_PREVIOUS_KEYS`;
4. deploy and re-encrypt records through an approved, separately reviewed operation;
5. verify enrollment/login/recovery evidence;
6. remove the old key only after no old-version ciphertext remains.

## Enterprise OIDC foundation

The disabled-by-default boundary supports profiles for Microsoft Entra ID, Google Workspace and
generic enterprise OIDC. The contract includes issuer, client ID, secret-manager reference,
discovery/authorization/token/JWKS endpoints, exact redirect URI, allowed domains, tenant mapping,
claim mapping and group-to-role mapping data.

The validator enforces Authorization Code Flow, S256 PKCE, hashed state and nonce, exact redirect,
RS256 allowlisting, `kid`/JWKS selection, issuer, audience, signature, `exp`/`nbf` skew,
`email_verified` and token-ID replay rejection. Metadata refresh validates the configured issuer and
endpoints before audit. A deterministic local mock IdP tests key selection and rotation contracts.

No callback exchanges a real authorization code yet, and no real Entra, Google or generic tenant
has been validated. Therefore the repository provides a secure validator and linking boundary, not
production-ready SSO.

Linking requires a recent server-side reauthentication record and a validated OIDC assertion.
Ownership of the current local identity and provider identity is therefore proven independently.
Unlink requires step-up and cannot remove the last login method. Tenant MFA policy remains attached
to membership and is unaffected by linking.

## Invitations

An invitation stores a hash of a 256-bit code, tenant, allowlisted `CLIENT` role, inviter, expiry,
acceptance and revocation state. It grants no membership before an authenticated, verified identity
accepts it. Acceptance is atomic and one-time; the client cannot supply tenant or elevated role.
Existing users accept in their authenticated session. New-user registration/provisioning must
create and verify the identity before the same acceptance endpoint can be used.

## Audit, notification and privacy

Security actions pass through a fixed action allowlist. Tenant is attached only when it exists in
server-side context. Safe metadata is limited to MFA method, reason code and safe session ID.
Notifications contain a generic title and fixed security-settings link.

The boundary never records raw email, full IP, user-agent, URL query, request body, password, OTP,
recovery/reset/invitation code, cookie, authorization header, TOTP secret, provider token, raw
claims or raw provider/audit error. The established audit policy is fail-open for user operations;
the failure is reduced to a generic server warning.

## Rollout and limitations

Migration is nullable-first, backfills current profiles/credentials/memberships and verification
state, then adds source-specific constraints. Existing signed-cookie sessions cannot be converted
to opaque database sessions and require a fresh login. Rollback after credential-column cleanup or
new security events is restore/forward-fix only; the rehearsal does not claim reversible down
migrations.

Repository-level gates cover unit/security, PostgreSQL integration, migration rehearsal, browser
identity scenarios, secret/default/credential/client-tenant scans and documentation links.
Environment acceptance remains blocked on the production-like ceremony in
[Identity Production Ceremony](./IDENTITY_PRODUCTION_CEREMONY.md), real IdP validation and manual
assistive-technology review.

## Related documents

- [Authentication](./authentication.md)
- [Security Hardening](./SECURITY_HARDENING.md)
- [Portal Architecture](./PORTAL_ARCHITECTURE.md)
- [ADR-0026](./DECISIONS.md#adr-0026)
- [TASK-009](./tasks/TASK-009.md)
