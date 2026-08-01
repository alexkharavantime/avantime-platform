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
- identity uses source-scoped credentials/external subjects and separate organization membership;
- production sessions are opaque, hashed in PostgreSQL, revocable and bounded by idle/absolute
  expiry;
- local passwords use versioned scrypt with legacy PBKDF2 rehash; TOTP secrets and OIDC PKCE
  verifiers use versioned AES-256-GCM; recovery/reset/verification/invitation codes are stored only
  as hashes;
- identity mutations enforce same-origin, distributed rate limit, server-derived tenant policy
  and allowlisted security audit metadata;
- OIDC providers are tenant-bound, disabled until real-tenant evidence is recorded, versioned,
  issuer-pinned and resolved from a global provider key rather than a client tenant identifier;
- OIDC discovery/token/JWKS requests use HTTPS, production host allowlists, bounded responses,
  timeouts and no redirects; legacy unscoped OIDC rows are quarantined disabled;
- containers run non-root with restricted filesystems/networks.

## Threat review

| Threat                              | Control                                                    |
| ----------------------------------- | ---------------------------------------------------------- |
| Cross-tenant metadata/vector access | tenant in every repository key/query and regression tests  |
| Queue tampering/duplicate delivery  | payload validation, idempotency, job version, fence        |
| Redis unauthorized access           | `rediss`, authentication, private network, fail closed     |
| Rate/budget bypass                  | Redis atomic script and PostgreSQL locked reservation      |
| Audit tampering                     | append-only application contract and restricted DB role    |
| Backup exposure/wrong restore       | encryption, separate bucket, explicit isolated target      |
| Provider secret leak/SSRF           | no secret output, endpoint validation, egress allowlist    |
| Command/path injection              | no shell, strict names/paths, random OCR temp              |
| Container escalation                | non-root, no privilege/capabilities/socket                 |
| Citation forgery                    | server rebuild from tenant-authorized provenance           |
| Credential enumeration/brute force  | uniform errors, dummy KDF, Redis rate limit, bounded input |
| Session theft/fixation              | opaque token hash, rotation, revoke, idle/absolute expiry  |
| MFA secret/code disclosure/replay   | AES-GCM, hashed recovery codes, persisted TOTP counter     |
| Cross-tenant identity linking       | provider subject identity separate from membership         |
| OIDC code/token substitution        | PKCE, state, nonce, exact redirect, issuer/audience/JWKS   |
| OIDC SSRF/discovery substitution    | HTTPS, host allowlist, no redirect, issuer pin, size/time  |
| IdP tenant confusion                | server provider lookup, Entra `tid`, Google `hd` allowlist |
| Recovery or invitation replay       | hashed one-time codes, TTL, atomic consume and tenant bind |

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

## Static checks

```bash
npm run security:secret-scan -w @avantime/web
npm run security:migration-scan -w @avantime/web
npm run security:identity-scan
npm run security:forbidden-credential-scan
npm run security:default-secret-scan
npm run security:client-tenant-scan
npm run security:permission-scan
```

TASK-012 extends the permission scan to reject new API imports of the legacy role adapter and to
inspect platform permission, approval and knowledge ownership boundaries. Platform/organization
unknown state denies; support sessions are tenant/scoped/expiring; approval fingerprints exclude
secrets and content. Knowledge reads require owner scope, visibility and quarantine filters.

Also review client-side `companyId`, direct provider SDK usage outside AI Gateway,
unsafe logging keys and deployment manifests containing credentials.

TASK-011 permission scan блокирует новые inline `ADMIN/CLIENT` authorization checks в API,
OIDC OWNER mapping и permissive fallback. Исключение ограничено единственной callback projection,
которая выбирает post-login landing page и не предоставляет доступ. Organization audit принимает
только allowlisted identifiers; deny audit bounded. OWNER lifecycle serialized by tenant row lock,
а critical actions требуют MFA, recent authentication и exact server-side confirmation. Полная
модель и compatibility boundary описаны в
[Authorization Architecture](./AUTHORIZATION_ARCHITECTURE.md).

## Рекомендации по улучшению

- Use separate least-privilege DB/Redis/S3 identities per process.
- Add signed provenance/audit export only after key-management design.
- Schedule dependency and container scans on every release digest.

## Связанные документы

- [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
- [Backup and Restore](./BACKUP_RESTORE.md)
- [AI Cost Control](./AI_COST_CONTROL.md)
- [Dependency Security Review](./DEPENDENCY_SECURITY_REVIEW.md)
- [Production Readiness Checklist](./PRODUCTION_READINESS_CHECKLIST.md)
- [Authentication](./authentication.md)
- [Identity Architecture](./IDENTITY_ARCHITECTURE.md)
- [Identity Production Ceremony](./IDENTITY_PRODUCTION_CEREMONY.md)
- [OIDC Production Rollout](./OIDC_PRODUCTION_ROLLOUT.md)
- [TASK-005](./tasks/TASK-005.md)
- [TASK-009](./tasks/TASK-009.md)
- [TASK-010](./tasks/TASK-010.md)
- [TASK-011](./tasks/TASK-011.md)
