# Dependency Security Review

## Review record

- Review date: `2026-07-29`.
- Reviewer: TASK-005 engineering security review.
- Registry and audit endpoint: official npm registry,
  `https://registry.npmjs.org/`.
- Raw report:
  [`security/npm-audit-2026-07-29.json`](./security/npm-audit-2026-07-29.json).
- Raw report SHA-256:
  `db6f657052dd9b7623d4d817fe7bfc3beb833c80d2da6376638fad657441b070`.
- Commands used: `npm audit --json`,
  `npm audit --omit=dev --omit=optional --json` and image-local
  `npm audit --omit=dev --json`.
- No source files, credentials or tokens were submitted. npm received standard
  dependency metadata from the lockfile.
- No `npm audit fix`, forced fix or automatic major update was used.

The authoritative full-tree result is `12 high`, `0 critical`. The
production-only result with optional dependencies excluded is one high
`postcss` record and one moderate aggregate `next` record. The actual
final web standalone retains nested PostCSS and optional Sharp; the pruned
worker, migration, operations and OCR test images do not.

## TASK-006 revalidation status

TASK-006 re-ran the authoritative full-tree audit on `2026-07-29` through the
official npm audit endpoint. It again reports `12 high`, `0 critical`: 142
production, 350 development and 128 optional dependency nodes (563 total).
The sanitized full JSON is retained locally at
`.artifacts/security/npm-audit-task-006-2026-07-29.json` with mode `0600`,
SHA-256
`eb8b287f9d9038dc9c98b7f6b52ff99ba6f6ee47b93b132301af7cc35f0bc53a`.
No source, credentials or tokens were submitted and no remediation command was
run.

Installed versions remain Next `15.5.21`, nested PostCSS `8.4.31` and Sharp
`0.34.5`; staging code does not change the documented reachability assumptions.
The audit now proposes incompatible `eslint 10.8.0` or
`eslint-config-next 12.0.4` major-line changes for the lint aggregate and an
unsafe Next downgrade to `9.3.3` for the runtime aggregate. No compatible
patch/minor dependency update is available. `AR-DEP-2026-001/002` still expire
on `2026-08-12` and are not extended by this revalidation.

Container OS/base-image findings are outside these npm acceptances. Final images
were rebuilt from `node:22.22.2-alpine3.23`, and SBOM/Grype reports were
regenerated against the new IDs. Global npm was removed, OpenSSL was upgraded,
OCR packages were limited to document-worker, and all production/operations
entrypoints were compiled in the builder so `tsx`, `esbuild`, embedded Go and
TypeScript are absent from final runtimes.

High/critical matches changed from `82/144/144/127/144/115` to
`3/11/0/0/0/11` for web/document-worker/embedding-worker/migration/operations/
OCR. SBOM IDs and scan IDs match. The detailed package, advisory, fix,
reachability and decision inventory is in
[SBOM and Image Scanning](./SBOM_AND_IMAGE_SCANNING.md).

The image gate remains `Blocked`, but the esbuild/Go blocker is eliminated. The
document-worker contains 11 unfixed GLib critical/high and SQLite/TIFF high
records through the selected OCR packages. Their proposed compensating controls
are documented, but only a named Security Owner may accept them. Existing
`AR-DEP-2026-001/002` apply only to the already-classified lint-chain and
unreachable web PostCSS/Sharp paths.

## Compatible update applied

`npm update minimatch brace-expansion` updated the compatible nested path:

```text
@typescript-eslint/typescript-estree
└─ minimatch 10.2.5 -> 10.2.6
   └─ brace-expansion 5.0.7 -> 5.0.8
```

This removed one affected `brace-expansion` node. The remaining
`minimatch 3.1.5 -> brace-expansion 1.1.16` path cannot consume the fixed
`brace-expansion 5.0.8` without an upstream major change. Consequently, the
number of top-level npm audit records remains 12.

## Advisory classification

`Direct` below refers to `apps/web/package.json`. An aggregate package record is
not a separate vulnerability: npm raises it because a vulnerable dependency is
reachable through that package.

| Package / installed version     | Dependency and affected range                                                                                                | Usage and reachability                                                                                                                                                                                                                     | Runtime images                                                                                         | Available fix and update risk                                                                                                                                         | Decision                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@eslint/config-array 0.21.2`   | Transitive: `eslint -> @eslint/config-array -> minimatch 3.1.5`; record range `<=0.22.0`                                     | Development lint only. Vulnerable glob expansion receives repository-controlled patterns, not request data.                                                                                                                                | Absent from every final runtime image.                                                                 | npm proposes `eslint 10.8.0`, a major update outside `eslint-config-next 15` peer support. High API/config regression risk.                                           | `AR-DEP-2026-001`, accepted build-time risk; review by `2026-08-12`.                      |
| `@eslint/eslintrc 3.3.6`        | Transitive: `eslint -> @eslint/eslintrc -> minimatch 3.1.5`; record range `0.0.1 \|\| >=0.1.1`                               | Development lint configuration only; no runtime or untrusted glob input.                                                                                                                                                                   | Same as `@eslint/config-array`.                                                                        | Requires the ESLint 10 major line. High lint/config compatibility risk.                                                                                               | `AR-DEP-2026-001`; review by `2026-08-12`.                                                |
| `brace-expansion 1.1.16`        | Transitive through `minimatch 3.1.5`; GHSA-mh99-v99m-4gvg, affected `<=5.0.7`                                                | Development lint only. DoS needs an attacker-controlled expansion pattern; CI patterns are repository-controlled and runners are bounded/ephemeral.                                                                                        | Absent from every final runtime image.                                                                 | Fixed release is `5.0.8`; the parent accepts only `1.x`. Direct override would cross four major lines. High compatibility risk.                                       | `AR-DEP-2026-001`; review by `2026-08-12`. The separate `5.0.7` node was fixed.           |
| `eslint 9.39.5`                 | Direct development dependency; aggregate via config packages and `minimatch`                                                 | Runs only in local/CI lint. It is not started by any production entrypoint.                                                                                                                                                                | Absent from every final runtime image.                                                                 | npm proposes `10.8.0`; SemVer major and unsupported by `eslint-config-next 15`. High regression risk.                                                                 | `AR-DEP-2026-001`; review by `2026-08-12`.                                                |
| `eslint-config-next 15.5.21`    | Direct development dependency; aggregate through ESLint plugins                                                              | Build/lint configuration only.                                                                                                                                                                                                             | Absent from every final runtime image.                                                                 | npm suggests `12.0.4`, an incompatible major-line downgrade. `15.5.22` retains the same dependency contract. No safe patch fix.                                       | `AR-DEP-2026-001`; review by `2026-08-12`.                                                |
| `eslint-plugin-import 2.32.0`   | Transitive: `eslint-config-next -> eslint-plugin-import -> minimatch 3.1.5`                                                  | Development lint only; no request-controlled input.                                                                                                                                                                                        | Absent from every final runtime image.                                                                 | Audit marks a fix available, but the affected path remains on the current latest plugin and needs an upstream dependency change. Override is unsafe.                  | `AR-DEP-2026-001`; review by `2026-08-12`.                                                |
| `eslint-plugin-jsx-a11y 6.10.2` | Transitive: `eslint-config-next -> eslint-plugin-jsx-a11y -> minimatch 3.1.5`; record range `>=6.5.0`                        | Development lint only.                                                                                                                                                                                                                     | Absent from every final runtime image.                                                                 | npm proposes an incompatible `eslint-config-next 0.2.4` downgrade.                                                                                                    | `AR-DEP-2026-001`; review by `2026-08-12`.                                                |
| `eslint-plugin-react 7.37.5`    | Transitive: `eslint-config-next -> eslint-plugin-react -> minimatch 3.1.5`; record range `>=7.23.0`                          | Development lint only.                                                                                                                                                                                                                     | Absent from every final runtime image.                                                                 | Current compatible plugin still resolves the affected `minimatch 3.x` line. Upstream change required.                                                                 | `AR-DEP-2026-001`; review by `2026-08-12`.                                                |
| `minimatch 3.1.5`               | Transitive through ESLint/config/plugins; affected aggregate range `2.0.0 - 10.0.2` through vulnerable `brace-expansion`     | Development lint only. Attacker-controlled glob expressions are not accepted by application APIs.                                                                                                                                          | Absent from every final runtime image.                                                                 | Fixed current line is `10.2.6`; moving the remaining `3.x` parents to it is a major dependency change.                                                                | `AR-DEP-2026-001`; review by `2026-08-12`.                                                |
| `next 15.5.21`                  | Direct production dependency; aggregate through `postcss 8.4.31` and optional `sharp 0.34.5`                                 | Next itself has no independent advisory in this report. Reachability is evaluated in the following two rows.                                                                                                                               | Present only in the final web standalone image; pruned from worker/migration/operations/test runtimes. | npm suggests `9.3.3`, an unsafe major downgrade. `15.5.22` retains the same PostCSS/Sharp constraints.                                                                | Aggregate accepted under `AR-DEP-2026-002`; review by `2026-08-12`.                       |
| `postcss 8.4.31` under Next     | Transitive: `next -> postcss`; GHSA-qx2v-qp2m-jg93 `<8.5.10`, GHSA-6g55-p6wh-862q `<=8.5.11`, GHSA-r28c-9q8g-f849 `<=8.5.17` | Build-time CSS processing only. The application accepts no CSS input and does not call PostCSS at runtime. Direct build dependency `postcss 8.5.22` is fixed; the vulnerable copy is pinned by Next.                                       | Present only in final web; not invoked by the runtime entrypoint.                                      | Patched at `8.5.18+`; Next pins exact `8.4.31`. An override violates Next's declared dependency contract and could regress compilation.                               | `AR-DEP-2026-002`, accepted unreachable runtime/build-input risk; review by `2026-08-12`. |
| `sharp 0.34.5`                  | Optional transitive: `next -> sharp ^0.34.3`; GHSA-f88m-g3jw-g9cj, affected `<0.35.0`                                        | Exploitation requires processing untrusted images. The application has no `next/image`, `ImageResponse` or direct Sharp use. Remote image patterns are not configured; documents remain in private storage and OCR uses Tesseract/Poppler. | Present only in final web and not imported by application entrypoints.                                 | Patched at `0.35.0`. For a `0.x` package this is a SemVer-breaking minor, outside Next's `^0.34.3` constraint. High compatibility risk without upstream Next support. | `AR-DEP-2026-002`, accepted unreachable-code risk; review by `2026-08-12`.                |

## Runtime classification

| Scope                     | Authoritative result / inventory                                        | Reachable vulnerable behavior                                                                    | Decision                                                                            |
| ------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Full monorepo             | 12 high records                                                         | Lint-chain only during trusted local/CI lint; PostCSS only during trusted build; Sharp is unused | Accepted risks `AR-DEP-2026-001` and `AR-DEP-2026-002`                              |
| Production web standalone | Nested `postcss` and optional `sharp`; lint-chain absent                | No runtime CSS processing and no image optimization use in application code                      | `AR-DEP-2026-002`                                                                   |
| Document worker           | Pruned npm runtime; native OCR packages remain                          | Compiled worker uses Tesseract/Poppler; native findings classified separately                    | 11 OS matches remain unaccepted                                                     |
| Embedding worker          | Pruned npm runtime; 0 critical/high image matches                       | Compiled worker starts directly with Node                                                        | Passed                                                                              |
| OCR Docker integration    | No node_modules; ephemeral test-only native OCR image                   | Runs repository-owned PDF/PNG/JPEG fixtures; not deployed                                        | 11 OS matches tracked separately, not production acceptance                         |
| Migration target          | Pruned Prisma CLI/runtime; 0 critical/high image matches                | Entrypoint runs only direct Node Prisma CLI `migrate deploy`                                     | Passed; privileged operational access remains controlled                            |
| Operations target         | Pruned compiled scripts; 0 critical/high image matches                  | Restricted operator entrypoints only                                                             | Passed                                                                              |
| Development/build-only    | Nine lint-chain records; PostCSS is used only with repository-owned CSS | No untrusted patterns, CSS or source maps                                                        | `AR-DEP-2026-001`; bounded CI runners and trusted changes are compensating controls |

## TASK-006 container dependency conclusion

The final Grype reports are not a replacement for npm audit and do not change
the TASK-005 npm acceptance. They add the following image-specific conclusion:

| Runtime scope    | Final high/critical matches | Classification                                                                          |
| ---------------- | --------------------------: | --------------------------------------------------------------------------------------- |
| Web              |                           3 | PostCSS/Sharp only; covered by active `AR-DEP-2026-002`.                                |
| Document worker  |                          11 | 7 GLib, 2 SQLite and 2 TIFF matches remain unaccepted production blockers.              |
| Embedding worker |                           0 | Compiled/pruned runtime passes.                                                         |
| Migration        |                           0 | Direct Prisma CLI runtime passes.                                                       |
| Operations       |                           0 | Compiled/pruned operator runtime passes.                                                |
| OCR Docker test  |                          11 | Ephemeral and not deployed; native matches remain visible with review due `2026-08-12`. |

No new accepted-risk record was created automatically. The esbuild/Go runtime
finding is fixed by packaging, not accepted. GLib/SQLite/TIFF are proposed
exceptions only and continue to block until a fixed package is used or Security
records owner, expiry and approval.

## Security acceptance

The review accepts `AR-DEP-2026-001` and `AR-DEP-2026-002` for TASK-005 because:

- no critical advisory exists;
- the high production-image records are not reachable through supported
  application flows;
- production inputs do not include user CSS, source maps, glob expressions or
  Sharp image-processing calls;
- document storage is private and document OCR is implemented by
  Tesseract/Poppler, not Sharp;
- workers have fixed entrypoints, run non-root and do not expose package tooling;
- build/lint execution uses reviewed repository input in bounded CI runners;
- the available npm suggestions require incompatible major changes, downgrades
  or dependency overrides outside upstream constraints.

Acceptance expires on `2026-08-12`. Before that date, re-run the audit and check
for a compatible Next 15 patch, an `eslint-config-next 15`-compatible ESLint fix,
or upstream releases that remove the pinned vulnerable paths. Any introduction
of runtime CSS processing, `next/image`, `ImageResponse`, direct Sharp use,
untrusted glob patterns or public image sources invalidates this acceptance and
blocks release until re-review.

There are no unaccepted critical/high production-runtime risks in this TASK-005
review. This acceptance covers dependency metadata only; OS image/package
scanning and environment-specific go-live approval remain release checklist
items outside TASK-005 completion.

## Рекомендации по улучшению

- Prefer upstream Next and ESLint fixes over dependency overrides.
- Build migration and test images from narrower dependency sets when Prisma and
  OCR tooling packaging is redesigned.
- Add SBOM and image scanning to the release-digest pipeline.
- Automate expiry enforcement for accepted dependency risks.

## Связанные документы

- [Security Hardening](./SECURITY_HARDENING.md)
- [Production Readiness Checklist](./PRODUCTION_READINESS_CHECKLIST.md)
- [TASK-005](./tasks/TASK-005.md)
- [SBOM and Image Scanning](./SBOM_AND_IMAGE_SCANNING.md)
- [TASK-006](./tasks/TASK-006.md)
