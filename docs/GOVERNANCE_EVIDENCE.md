# Governance evidence bundle

`governance:evidence` writes schema-versioned JSON to an explicitly configured directory outside
production tables. Files are created once with mode `0600`; the directory uses `0700`. Output
contains timestamp, environment, commit SHA, migration version, ceremony, correlation ID, hashed
actor identifiers, expected/actual outcomes, safe audit/notification/approval/support references,
resource version, sanitized artifact references, pass/fail and a nullable reviewer sign-off.

The validator rejects sensitive field names and secret-shaped content. Passwords, authorization
tokens, cookies, raw session values, email/tenant content, document text, private messages,
provider claims and credentials are forbidden. Screenshots and JSON are referenced only after
manual sanitization; the bundle never copies their raw payload. Operational IDs may be retained
where needed to join audit evidence, while people are represented by SHA-256 hashes.

Evidence proves a repository/simulated or explicitly operated staging ceremony only. It does not
convert CI into a staging ceremony and does not establish production readiness. Retention,
reviewer sign-off and deletion follow the controlled evidence store policy.

TASK-014 envelopes canonicalize keys before SHA-256, verify tampering and use create-once `wx`
semantics. Reviewer sign-off is a separate envelope that binds the evidence hash and rejects the
same actor on both sides. A signed record is immutable; corrections create a new correlated bundle.
See [Governance sign-off](./GOVERNANCE_SIGNOFF.md).

See [Governance validation](./GOVERNANCE_VALIDATION.md) and
[evidence collection](./runbooks/governance-incident-response.md#evidence-collection).
