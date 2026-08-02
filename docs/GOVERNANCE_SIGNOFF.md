# Governance reviewer sign-off

A sign-off is a separate write-once JSON envelope outside Git and production tables. It binds the
staging environment, commit, migration, ceremony, correlation ID and evidence SHA-256 to distinct
operator/reviewer hashes plus external approval and signature references. CI is explicitly denied
from creating one.

`passed` is rejected when deviations or blockers are present. Operator and reviewer hashes must
differ. Canonical key ordering makes SHA verification independent of pretty-printing; any change to
the evidence or sign-off produces `GOVERNANCE_*_TAMPERED`. Files use `0600`, their directory uses
`0700`, and `wx` creation prevents overwrite. Correction means a new evidence/sign-off pair, never
editing a signed record.

The controlled store must enforce retention, access review and immutable/versioned retention after
sign-off. Store no name, email, raw signature, tenant content, token or provider payload. The
external system remains authoritative for human identity and signature verification.

Use `governance evidence verify`, review the referenced artifacts independently, then
`governance sign-off create`; a second party runs `governance sign-off verify`. A repository test,
CI job or unsigned bundle is not acceptance evidence.
