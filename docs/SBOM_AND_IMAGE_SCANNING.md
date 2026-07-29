# SBOM and Image Scanning

## Images and artifacts

The gate covers web, document-worker, embedding-worker, migration, operations
and the separate OCR integration image.

```bash
npm run staging:images:build
npm run test:ocr-integration:docker
npm run staging:sbom
npm run staging:image-scan
```

Syft produces CycloneDX JSON. When a host Syft binary is unavailable, the local
runner uses the official pinned `anchore/syft:v1.50.0` image; the registry digest
observed during the 2026-07-29 pull is
`sha256:1288ea4c8b38767b4e620c1e312c8cb26b6e887a99b4f07ab6cd19fc6f225026`.
Artifacts use deterministic names under ignored `.artifacts/image-security`,
include exact image IDs and SHA-256 checksums, and must never contain source,
environment files or secrets.

Local vulnerability analysis uses the official pinned
`anchore/grype:v0.112.0` image (registry digest observed during the
2026-07-29 pull:
`sha256:391bfda62888fb4e98ff5c4c81598f7431a3c1eac3f8519d69d1ff00df247c1d`).
Its public database is cached under ignored `.artifacts`; source and credentials
are not sent. Docker Scout remains unsupported for scanning on this workstation
because it requires an unavailable Docker ID login.

CI uses pinned Anchore SBOM/Grype actions, retains sanitized artifacts for 30
days and never publishes images. Scans cover OS, npm and base-image packages,
fixed/unfixed status and all runtime targets.

## Policy

- critical and high findings block promotion until classified;
- an exception must identify reachability, compensating controls, owner,
  evidence and expiry;
- expired exceptions fail closed;
- `AR-DEP-2026-001/002` apply only to their documented npm paths and do not
  accept unrelated OS findings;
- no scanner performs automatic remediation.

Image scopes are explicit:

| Scope               | Images                                 | Gate policy                                                                  |
| ------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| Production runtime  | web, document-worker, embedding-worker | Every critical/high finding needs reachability classification and a decision |
| Migration runtime   | migration                              | Separate one-shot scope, but still blocking without a decision               |
| Operations runtime  | operations                             | Separate restricted operator scope, but still blocking without a decision    |
| Ephemeral test-only | OCR integration                        | Never published/deployed; tracked with a review deadline, not auto-accepted  |

The compatible production base declaration was updated from
`node:22.17.1-alpine3.22` to
`node:22.22.2-alpine3.23@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f`.
The test-only OCR image moved from Debian 12 to the same Alpine base. Final
images upgrade `libcrypto3`/`libssl3` to `3.5.7-r0`, remove the global npm CLI,
compile worker/operations entrypoints in the builder, remove `tsx`, `esbuild`,
`@esbuild` and TypeScript from every final runtime, and install
Tesseract/Poppler only in the document-worker and isolated OCR test image.

### Final rebuilt image evidence

The 2026-07-29 SBOM manifest and Grype summary contain the same image IDs:

| Target           | Final image ID  | CycloneDX components | Grype C/H | Fixed | Unfixed |
| ---------------- | --------------- | -------------------: | --------: | ----: | ------: |
| Web              | `a05a1671e81f…` |                  422 |       0/3 |     3 |       0 |
| Document worker  | `6ba7595ff3ed…` |                  858 |      1/10 |     0 |      11 |
| Embedding worker | `90b5dfacfeec…` |                  360 |       0/0 |     0 |       0 |
| Migration        | `dae5b4f38a5b…` |                  332 |       0/0 |     0 |       0 |
| Operations       | `37c57d7cb5f4…` |                  434 |       0/0 |     0 |       0 |
| OCR integration  | `f69a778ec737…` |                  604 |      1/10 |     0 |      11 |

`npm run staging:images:verify` also confirmed for these IDs: non-root users,
direct Node commands, valid compiled JavaScript, no runtime build tooling, no
source maps, and OCR binaries only in document-worker and the test-only image.

### Pre/post comparison

| Target           | Original pre-remediation | Before compiled runtime | Final | Final reduction |
| ---------------- | -----------------------: | ----------------------: | ----: | --------------: |
| Web              |                       82 |                       3 |     3 |             96% |
| Document worker  |                      144 |                      61 |    11 |             92% |
| Embedding worker |                      144 |                      50 |     0 |            100% |
| Migration        |                      127 |                       4 |     0 |            100% |
| Operations       |                      144 |                      50 |     0 |            100% |
| OCR integration  |                      115 |                      59 |    11 |             90% |

The final scan removed the old Node/OpenSSL/musl/global npm findings and all 44
esbuild/embedded-Go matches from every runtime. Production pruning also removed
dormant Next/PostCSS/Sharp and lint-chain packages from worker, migration,
operations and OCR test images. OCR packages remain isolated to
document-worker and the test-only image.

### Controlled OCR base comparison

The same compiled OCR test and synthetic PDF/PNG/JPEG fixtures were run as
non-root UID `10001` on both candidate bases:

| Candidate          | Image ID        |        Size | OCR result     | Grype C/H |
| ------------------ | --------------- | ----------: | -------------- | --------: |
| Alpine 3.23        | `db014a543d31…` | 268,025,436 | 3 formats pass |      1/10 |
| Debian Trixie slim | `17959ebf5704…` | 388,486,881 | 3 formats pass |     22/53 |

Debian was rejected: it is about 120 MB larger, retains GLib/SQLite/TIFF, and
reports 75 critical/high matches versus Alpine's 11. This comparison is
decision evidence only; neither temporary image is a release artifact.

### Residual finding classification

Every residual critical/high scanner ID is listed below. No record is hidden or
ignored.

| Component / path                     | Advisory, severity, affected version                              | Affected image and reachability                                                                                                                                                                              | Fix / risk                                                                        | Decision                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `next -> postcss 8.4.31`             | High `GHSA-6g55-p6wh-862q`, `GHSA-r28c-9q8g-f849`                 | Web only. No runtime CSS or attacker-controlled source maps.                                                                                                                                                 | `8.5.12`/`8.5.18`; Next pins `8.4.31`, override risks framework build regression. | Existing `AR-DEP-2026-002` until `2026-08-12`; accepted, not extended.                      |
| `next -> sharp 0.34.5`               | High `GHSA-f88m-g3jw-g9cj`                                        | Web only. No `next/image`, `ImageResponse` or direct Sharp use.                                                                                                                                              | `0.35.0`; breaking `0.x` minor outside Next constraint.                           | Existing `AR-DEP-2026-002` until `2026-08-12`; accepted, not extended.                      |
| `tesseract-ocr -> glib 2.86.3-r0`    | Critical `CVE-2026-58016`; High `CVE-2026-58010`–`CVE-2026-58015` | Document-worker production and OCR test. Selected flow invokes only Tesseract/Poppler, not D-Bus, key-file, regex/date or custom IO-channel APIs, but Alpine declares GLib as a direct Tesseract dependency. | No Alpine 3.23 fixed package. Removing GLib breaks the selected package/runtime.  | **Production release blocker.** No acceptance. Test-only duplicate tracked to `2026-08-12`. |
| `nss -> sqlite-libs 3.51.2-r0`       | High `CVE-2026-11822`, `CVE-2026-11824`                           | Document-worker production and OCR test. App has no SQLite database or FTS5 input; NSS is loaded by Poppler.                                                                                                 | No Alpine fix reported; deleting the library breaks the package graph.            | **Production release blocker.** No acceptance. Test-only duplicate tracked to `2026-08-12`. |
| `leptonica/poppler -> tiff 4.7.1-r0` | High `CVE-2023-52356`, `CVE-2026-4775`                            | Document-worker production and OCR test. `tesseract` and `pdftoppm` load `libtiff`; TIFF uploads are forbidden and regression-tested.                                                                        | No Alpine fix reported; deleting TIFF breaks both OCR/PDF native paths.           | **Production release blocker.** No acceptance. Test-only duplicate tracked to `2026-08-12`. |

Runtime inspection proves these native libraries are not removable packaging
noise: Tesseract loads Leptonica and TIFF; `pdftoppm` loads Poppler, NSS and
TIFF; Alpine reverse dependencies are `tesseract/pango/harfbuzz -> glib`,
`nss -> sqlite-libs`, and `leptonica/poppler -> tiff`. Splitting OCR into a new
distributed service would change the validated queue/worker architecture and is
outside this remediation scope. Compensating controls are format detection,
PDF/PNG/JPEG allowlist, explicit TIFF rejection, bounded pages/bytes/time,
private object storage, non-root isolated worker, restricted network and
resource limits. These controls do not constitute acceptance.

The local scanner returns exit `2` when high/critical findings need review. A
report existing, or scanning an obsolete image ID after a Dockerfile change, is
not evidence of acceptance.

## Related documents

- [Dependency Security Review](./DEPENDENCY_SECURITY_REVIEW.md)
- [Security Hardening](./SECURITY_HARDENING.md)
- [Go-Live Evidence](./GO_LIVE_EVIDENCE.md)
- [TASK-006](./tasks/TASK-006.md)
