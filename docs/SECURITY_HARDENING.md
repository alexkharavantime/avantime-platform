# Security Hardening

## Enforced boundaries

- tenant is server-derived and mandatory in queue, repository, vector, budget and
  audit operations;
- production rejects local storage/queue, memory limiter, fake providers,
  placeholders, weak secrets, non-TLS database/S3/Redis and private provider URLs;
- provider endpoints are allowlisted by protocol and protected from private-host
  SSRF targets;
- queues validate identifiers and exclude content;
- lease fencing blocks stale/late worker writes and double completion;
- AI calls require distributed rate and budget authorization;
- backup/restore commands use argument arrays, explicit target confirmation and
  isolated environment guards;
- OCR uses `spawn` without shell, allowlists languages and cleans random temp dirs;
- containers run non-root with restricted filesystems/networks.

## TASK-006 staging controls

- staging requires a unique `staging-*` environment ID and at least two
  allowlisted `staging-*` tenants;
- configured production hostnames and matching production secret fingerprints
  are rejected;
- local plaintext is possible only with an explicit override and private
  loopback/internal services; external staging endpoints require TLS;
- only reverse proxy publishes ports in the staging manifest;
- environment, mounted-file and external secret contracts fail fast for missing,
  placeholder, unversioned or stale values;
- provider endpoints use official HTTPS allowlists; connectivity requires exact
  confirmation and a budget reservation;
- evidence and alert payloads redact/reject content, prompts, answers,
  embeddings, credentials and authorization data;
- approvals default to pending and cannot be marked by automation;
- expired vulnerability exceptions fail closed.

## Threat review

| Threat                              | Control                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| Cross-tenant metadata/vector access | tenant in every repository key/query and regression tests |
| Queue tampering/duplicate delivery  | payload validation, idempotency, job version, fence       |
| Redis unauthorized access           | `rediss`, authentication, private network, fail closed    |
| Rate/budget bypass                  | Redis atomic script and PostgreSQL locked reservation     |
| Audit tampering                     | append-only application contract and restricted DB role   |
| Backup exposure/wrong restore       | encryption, separate bucket, explicit isolated target     |
| Provider secret leak/SSRF           | no secret output, endpoint validation, egress allowlist   |
| Command/path injection              | no shell, strict names/paths, random OCR temp             |
| Container escalation                | non-root, no privilege/capabilities/socket                |
| Citation forgery                    | server rebuild from tenant-authorized provenance          |

## Dependency review

Run without automatic fixes:

```bash
npm run security:dependency-review
```

Classify each advisory as production/development, direct/transitive and
exploitable/non-exploitable in this architecture. Apply compatible updates only
after tests/build/integration; never use `npm audit fix --force`. Record accepted
risks with owner, expiry and compensating control.

For release images, generate SBOM and scan OS/npm layers. OCR packages and language
data are part of the document-worker image and must be included in the scan.
TASK-006 uses pinned Syft/Grype CI actions and a pinned local Grype image.
Critical/high findings fail closed; the TASK-005 npm exceptions do not cover OS,
Node runtime, OpenSSL or unrelated bundled-tooling findings.

CI and the local release scanner enforce
[`security/container-vulnerability-policy.json`](../security/container-vulnerability-policy.json)
with the same evaluator. A decision must match the exact image target,
production/test classification, CVE/GHSA, package, severity, risk/tracking ID
and expiry. Missing/malformed reports, classification mismatches, expired
records, severity escalation, and unknown or additional critical/high findings
block. No image, package or severity has a blanket ignore.

### Current TASK-005 review status

The authoritative 2026-07-29 npm audit against the official npm registry reports
12 high records and no critical records for the full dependency tree. The
production-only tree without optional dependencies reports one high PostCSS
record and one moderate aggregate Next record. Image-local worker audits retain
optional Sharp and therefore report three high records each: `next`, `postcss`
and `sharp`.

All records, dependency paths, image presence, reachability, fixes and decisions
are classified in
[Dependency Security Review](./DEPENDENCY_SECURITY_REVIEW.md). The raw,
credential-free audit result is stored in
[`security/npm-audit-2026-07-29.json`](./security/npm-audit-2026-07-29.json).

A compatible update moved `minimatch 10.2.5` to `10.2.6` and its
`brace-expansion 5.0.7` dependency to patched `5.0.8`. The remaining lint path
requires ESLint 10 or unsafe cross-major overrides. Next 15.5.21 pins vulnerable
PostCSS 8.4.31 and constrains Sharp to the vulnerable 0.34 line; Next 15.5.22
retains those constraints.

`AR-DEP-2026-001` accepts the development lint-chain findings.
`AR-DEP-2026-002` accepts the unreachable PostCSS/Sharp production-image
findings. Both expire on 2026-08-12. The acceptance is invalidated by runtime CSS
processing, `next/image`, `ImageResponse`, direct Sharp use, untrusted glob
patterns or public image sources.

TASK-006 repeated the authoritative audit with the same 12 high/0 critical
result and stored a sanitized mode-`0600` report under ignored `.artifacts`.
All six final images were rebuilt, re-inventoried and rescanned against matching
IDs. The Node/OpenSSL and global npm tooling findings were removed; OCR packages
were removed from embedding-worker and operations. Worker and operations
entrypoints are compiled in the builder; final images contain no `tsx`,
`esbuild`, embedded Go toolchain, TypeScript, global npm/npx or source maps.
Final Grype high/critical counts are web 3, document-worker 11,
embedding-worker 0, migration 0, operations 0 and test-only OCR 11.

The web check may pass only while the exact PostCSS/Sharp set is covered by
active `AR-DEP-2026-002`, which expires at `2026-08-12T23:59:59Z`. The
document-worker check remains blocked by unaccepted
`RISK-OCR-NATIVE-2026-001`. The OCR integration image is explicitly
non-published, ephemeral and test-only: its identical native set produces a
visible tracked warning under `TR-OCR-TEST-2026-001`, also expiring
`2026-08-12T23:59:59Z`, rather than accepting or hiding production risk.

Promotion remains blocked only on the unaccepted production OCR-native residue.
The selected Alpine Tesseract/Poppler stack brings unfixed GLib
(1 critical/6 high), SQLite (2 high) and TIFF (2 high) records into
document-worker. Tesseract directly requires GLib and loads Leptonica/TIFF;
Poppler loads NSS/TIFF and NSS requires SQLite. Removing those libraries would
break the installed package graph. Format detection, PDF/PNG/JPEG allowlisting,
explicit TIFF rejection, page/file/time limits, private storage, non-root
execution, isolation and resource bounds reduce exploitability but do not
constitute approval. A controlled Debian slim comparison passed the same OCR
fixtures but was 120 MB larger and reported 75 critical/high matches versus 11,
so Alpine remains selected. Full IDs, fixes and reachability are recorded in
[SBOM and Image Scanning](./SBOM_AND_IMAGE_SCANNING.md).

## Static checks

```bash
npm run security:secret-scan -w @avantime/web
npm run security:migration-scan -w @avantime/web
```

Also review client-side `companyId`, direct provider SDK usage outside AI Gateway,
unsafe logging keys and deployment manifests containing credentials.

## Рекомендации по улучшению

- Use separate least-privilege DB/Redis/S3 identities per process.
- Add signed provenance/audit export only after key-management design.
- Schedule dependency and container scans on every release digest.
- Keep staging and production secret fingerprints in the approved control plane,
  not in repository evidence.

## Связанные документы

- [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
- [Backup and Restore](./BACKUP_RESTORE.md)
- [AI Cost Control](./AI_COST_CONTROL.md)
- [Dependency Security Review](./DEPENDENCY_SECURITY_REVIEW.md)
- [Production Readiness Checklist](./PRODUCTION_READINESS_CHECKLIST.md)
- [TASK-005](./tasks/TASK-005.md)
- [Staging Architecture](./STAGING_ARCHITECTURE.md)
- [SBOM and Image Scanning](./SBOM_AND_IMAGE_SCANNING.md)
- [TASK-006](./tasks/TASK-006.md)
