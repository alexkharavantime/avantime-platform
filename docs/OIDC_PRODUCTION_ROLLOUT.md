# OIDC Production Rollout

This runbook governs Microsoft Entra ID, Google Workspace OIDC and generic enterprise OIDC
validation. It never permits credentials, authorization codes, tokens, cookies, claims or
screenshots containing them in Git, CI logs or the evidence package.

## Roles and prerequisites

- Provider Owner controls the enterprise tenant and client registration.
- Platform Owner controls deployment configuration, egress and secret injection.
- Security Owner reviews tenant mapping, evidence and rollout/rollback.
- Organization ADMIN configures only its own tenant-bound provider in Avantime.

Required before validation:

- production-like staging is healthy over HTTPS;
- `AUTH_PUBLIC_ORIGIN` is the exact deployed origin;
- callback is exactly `<AUTH_PUBLIC_ORIGIN>/api/auth/oidc/callback`;
- `OIDC_ALLOWED_HOSTS` contains only the required discovery/token/JWKS hosts;
- the client-secret value is stored outside the database and Git; the database stores only an
  encrypted reference such as `env:OIDC_<PROVIDER>_CLIENT_SECRET`;
- test users already exist, have active organization membership and are linked through the
  controlled linking ceremony;
- break-glass local ADMIN access, audit queries and rollback owner are available.

## Provider-specific controls

### Microsoft Entra ID

- use a tenant-specific issuer and discovery URL, not an unbounded multi-tenant issuer;
- validate exact issuer, client audience and `tid`;
- put only approved tenant IDs in `tenantMappingPolicy.allowedTenantIds`;
- configure Authorization Code Flow with PKCE and the exact callback;
- group mapping may grant only `CLIENT`; ADMIN elevation requires a separate approved process.

### Google Workspace

- use issuer `https://accounts.google.com`;
- validate the `hd` claim against the approved Workspace domains;
- do not infer Workspace membership from the email suffix;
- configure the exact callback and Authorization Code Flow;
- group mapping may grant only `CLIENT`.

### Generic enterprise OIDC

- pin an exact HTTPS issuer/discovery URL;
- select `STATIC`, `PROVIDER_TENANT_CLAIM`, `HOSTED_DOMAIN` or an allowlisted custom claim based on
  the provider contract;
- document claim names and accepted values; never accept a client-provided Avantime tenant ID;
- verify that discovery, token and JWKS hosts are in the production egress allowlist.

## Validation procedure

1. Create the disabled provider as the target organization ADMIN. Record provider ID and config
   version, but not client ID or secret reference in public evidence.
2. Refresh discovery metadata server-side. Confirm the exact issuer, authorization endpoint, token
   endpoint, JWKS URI and metadata timestamp. A mismatch stops the ceremony.
3. Inject the secret value through the approved deployment boundary. Confirm resolution without
   printing it.
4. Link a disposable pre-provisioned test identity using explicit `mode=link` and recent
   reauthentication. Confirm that no user or membership was created automatically.
5. In a controlled validation deployment, perform a real Authorization Code login. Verify:
   - state and nonce are single use;
   - PKCE S256 is present;
   - callback URI is exact;
   - issuer, audience, signature and time claims pass;
   - Entra `tid`, Google `hd` or the approved generic mapping matches;
   - the created session records the provider ID;
   - audit contains only safe references.
6. Repeat a consumed callback and confirm denial. Attempt an unlinked subject and a disallowed
   tenant/domain and confirm denial without user/membership creation.
7. The dedicated `PROVIDER_VALIDATION` callback records a safe
   `oidc-validation:<authorization-request-id>` evidence reference and `TENANT_VALIDATED` only
   after the real tenant connection and issuer/audience/signing-key/tenant checks complete. It
   creates no login session.
8. Store the completed non-secret owner evidence template in the controlled evidence system and
   cross-reference the technical evidence ID. A normal login, metadata refresh or UI checkbox
   cannot produce `TENANT_VALIDATED`.
9. Enable the provider. Enable is blocked if metadata is stale, validation is incomplete or the
   secret reference cannot be resolved.
10. Set organization SSO to `OPTIONAL` and complete fresh-login, MFA and recovery checks.
11. After the approved observation window, stage `REQUIRED` with an enforcement timestamp and
    grace period. Confirm local-login behavior and break-glass access.
12. Security Owner signs the evidence and promotion decision.

## Rollback and disable

1. Set the provider disabled. New authorizations and MFA completion fail closed immediately.
2. Apply the configured session policy:
   - `REVOKE_ON_DISABLE` revokes active provider sessions;
   - `PRESERVE_EXISTING` keeps already-created sessions until normal expiry/revoke, but no new
     provider session can be created.
3. Set organization SSO to `DISABLED` or an approved fallback before provider removal.
4. Revoke/rotate the client secret at the IdP and deployment secret boundary when compromise is
   suspected.
5. Preserve redacted audit/evidence references and repeat validation after any issuer, client,
   redirect, mapping or secret-boundary change.

Stop promotion on issuer/audience/signature mismatch, unexpected tenant/hosted domain, auto-created
membership, sensitive data in logs, unresolved secret, stale metadata, failed replay denial,
missing audit evidence or absent owner acceptance.

## Current validation status

| Provider profile        | Deterministic repository validation  | Real tenant validation |
| ----------------------- | ------------------------------------ | ---------------------- |
| Microsoft Entra ID      | Passed for protocol and `tid` policy | Not performed          |
| Google Workspace OIDC   | Passed for protocol and `hd` policy  | Not performed          |
| Generic enterprise OIDC | Passed with deterministic mock IdP   | Not performed          |
