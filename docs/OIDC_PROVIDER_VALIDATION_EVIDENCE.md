# OIDC Provider Validation Evidence

Copy this template into the approved restricted evidence system. Do not put completed production
forms in Git when they contain internal tenant, client, user or infrastructure identifiers.

```text
Evidence reference:
Environment:
Deployment revision:
Provider profile: Microsoft Entra ID | Google Workspace | Generic OIDC
Avantime provider safe ID:
Avantime organization safe ID:
Configuration version:
Validation started/finished UTC:
Provider Owner:
Platform Owner:
Security Owner:

Client registration review: PASS | FAIL
Exact redirect review: PASS | FAIL
Secret boundary/resolution review: PASS | FAIL
Discovery issuer match: PASS | FAIL
Authorization endpoint review: PASS | FAIL
Token endpoint review: PASS | FAIL
JWKS/signing-key validation: PASS | FAIL
Audience validation: PASS | FAIL
Nonce/state/PKCE validation: PASS | FAIL
Replay denial evidence ID:
Tenant mapping type: tid | hd | static | custom claim
Tenant mapping validation: PASS | FAIL
Disallowed tenant/domain denial evidence ID:
Unlinked subject denial evidence ID:
No JIT user/membership creation: PASS | FAIL
Provider-linked session evidence ID:
MFA policy evidence ID:
Audit/redaction evidence ID:
Disable/session-policy drill ID:
Rollback drill ID:

Real provider tenant connection performed: YES | NO
Validation decision: TENANT_VALIDATED | FAILED | NOT_VALIDATED
Security Owner acceptance reference:
Acceptance timestamp/expiry:
Open exceptions:
```

`TENANT_VALIDATED` is invalid unless “Real provider tenant connection performed” is `YES` and all
issuer, audience, signing-key and tenant-mapping checks passed. Deterministic mock IdP results must
be recorded as repository test evidence and never as a real-provider acceptance.
