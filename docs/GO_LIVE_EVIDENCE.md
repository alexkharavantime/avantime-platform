# Go-Live Evidence

## Package

Generate a sanitized partial package:

```bash
npm run staging:evidence -- --example
npm run staging:evidence:validate -- --file=.artifacts/staging/staging-unassigned/go-live-evidence.json
```

The package records branch/commit, environment ID/timestamp, configuration,
migrations, health, smoke, TLS/provider, backup/restore, SBOM checksums, scan and
dependency status, monitoring/alerts, load metrics, risks, approvals and the
formal decision.

When local image artifacts exist, the generator imports
`.artifacts/image-security/sbom/manifest.json` and
`.artifacts/image-security/scans/summary.json`, records every image ID and
checksum, links every raw Grype report to its
`avantime-<target>.policy.json` result, and verifies that SBOM/scan IDs match.
The policy result exposes the target classification, publication/production
flags, exact decision, risk/tracking ID and expiry. A blocked scan is emitted as
a failed blocking gate; it is never converted to acceptance by evidence
generation. The current 2026-07-29 package therefore records the factual final
image reports and remains `BLOCKED`. Its matching final IDs report
`3/11/0/0/0/11` critical/high matches for
web/document-worker/embedding-worker/migration/operations/OCR-test. The web
records pass only through active `AR-DEP-2026-002`; the identical OCR test-image
set is a visible non-production warning tracked by `TR-OCR-TEST-2026-001`.
Neither changes the fact that the 11 production OCR-native document-worker
records are unaccepted and keep the image gate failed. Unknown/additional
critical or high records and expired policy records fail closed. The regenerated
sanitized package validates with SHA-256
`e057ad2fed28ab6916b3c3fd9a11bea4a251604ca84bea5a3f89ad6c4ef78ac5`.

Generated artifacts live under ignored `.artifacts/staging/<environment-id>`,
mode `0600`, with SHA-256 sidecars. External immutable storage, retention and
access control are deployment responsibilities.

Forbidden fields and values are recursively redacted: credentials, secrets,
authorization/cookies, document text/content, prompts, answers and embeddings.
The validator rejects an unsanitized or incomplete package.

## Decision model

- `READY`: all blocking gates passed and no accepted risks;
- `READY_WITH_ACCEPTED_RISKS`: blocking gates passed and active approved risks
  remain;
- `BLOCKED`: a blocking gate failed or is pending;
- `NOT_EVALUATED`: no evidence was evaluated.

Missing migration, tenant isolation, backup/restore, TLS, required provider,
monitoring, alert delivery, rollback, owner approval, critical vulnerability or
unaccepted high runtime finding is blocking.

## Related documents

- [Go-Live Checklist](./GO_LIVE_CHECKLIST.md)
- [Production Readiness Checklist](./PRODUCTION_READINESS_CHECKLIST.md)
- [TASK-006](./tasks/TASK-006.md)
