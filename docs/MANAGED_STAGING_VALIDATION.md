# Managed staging governance validation

TASK-014 separates repository validation, CI simulation, manually operated managed staging and
production. Only the first two were executed in this task. No managed staging credentials,
operator authorization or independent reviewer were available, so every external ceremony below
remains `PENDING`. Production bootstrap and recovery are denied by code and procedure.

## Gap matrix

| Validation gate           | Current repository support                                                 | Staging dependency                                      | Required actors                                  | Required credentials                           | Required evidence                                                      | Rollback                                  | Pass criteria                                                        | Blocker                                                             | Status                          |
| ------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| Read-only preflight       | `governance preflight`, structured probes, non-zero blockers               | Deployed app, DB, Redis, S3, Resend, pgvector           | operator with recent MFA                         | external secret-store injection                | canonical preflight envelope                                           | none; probes are read-only                | all 13 configuration/probe gates pass                                | no managed environment                                              | `PENDING`                       |
| First owner               | singleton bootstrap, advisory lock, atomic revoke/audit/inbox notification | zero owners and separate short authorization            | operator, exact target, reviewer                 | token/hash, target session and TOTP references | dry-run/execute IDs, provider receipt, new-login observation, sign-off | transaction rollback; never delete ledger | one owner, consumed authorization, replay/concurrency denied         | external delivery is not executed                                   | `PENDING`                       |
| Support                   | scoped expiring session, indicator, deny and termination tests             | synthetic tenant                                        | support actor, tenant observer, auditor/reviewer | recent MFA session                             | start/end audit, external receipt, deny results                        | terminate and remove role                 | access ends on terminate/expiry/role removal                         | no staging actors                                                   | `PENDING`                       |
| Approval                  | requester separation, TTL/fingerprint/version, single-use executors        | four synthetic action targets                           | requester, independent approver, reviewer        | both recent MFA sessions                       | request/decision/execution chain and receipts                          | reject/cancel/expire; create new request  | self/replay/concurrency/permission-loss denied                       | no staging actors                                                   | `PENDING`                       |
| Knowledge lifecycle       | organization ownership and PUBLIC approval; DB-backed audience search      | synthetic article and managed search/RAG/cache adapters | author, reviewer, approver                       | recent MFA sessions                            | versions, approval, search/RAG/cache observations                      | archive or PRIVATE                        | PUBLIC appears, archive removes every public/search/RAG/cache result | articles have no dedicated cache/vector index in current repository | `BLOCKED`                       |
| Notification delivery     | receipt schema, sanitization and completeness validator                    | provider accepted and delivered events                  | operator and synthetic recipient owner           | provider key from secret store                 | provider message IDs, hashes, timestamps, retry/dead-letter status     | stop validation; preserve failed receipt  | every required event is delivered                                    | governance inbox writes are not an external outbox                  | `BLOCKED`                       |
| Invalidation              | version/fencing observation and bounded polling validator                  | measurable cache/search/vector generations              | operator, reviewer                               | managed backend access                         | before/after versions and negative retrievals                          | archive/private and reindex retry         | all stale/foreign checks pass                                        | no knowledge cache/vector adapter                                   | `BLOCKED`                       |
| Reviewer sign-off         | canonical SHA-256 envelope, distinct actors, write-once file, CI denial    | external approval/signature system                      | operator and independent reviewer                | external signature references                  | evidence SHA and sign-off SHA                                          | issue a new record; never edit            | no blocker/deviation on passed record                                | no reviewer                                                         | `PENDING`                       |
| Manual accessibility      | explicit checklist and browser automation baseline                         | real browser/AT devices                                 | human reviewer                                   | staging login                                  | dated sanitized references                                             | fix and repeat                            | keyboard, screen reader, focus, responsive, expiry UX pass           | no human review                                                     | `PENDING`                       |
| Last-owner recovery drill | staging-only two-person policy validator; no grant executor/backdoor       | approved recovery authority                             | operator and independent reviewer                | recent MFA and external authority reference    | exact target, temporary expiry, audit/notification/revoke plan         | revoke temporary grant                    | post-review and revocation verified                                  | no staging authorization                                            | `PENDING`                       |
| Dependencies              | fresh audit parser, expiring risk policy, critical fail                    | official npm registry                                   | security owner/reviewer                          | none                                           | raw report, paths, acceptance IDs                                      | revert compatible lock update             | no critical/unclassified high; acceptance unexpired                  | Next pins PostCSS 8.4.31 and optional Sharp 0.34.5                  | `PASS WITH AR-DEP-2026-002/003` |

## Operator boundary

Managed commands require exact `staging` binding in both operation and deployment environment,
`GOVERNANCE_MANUAL_TRIGGER=true`, operator ID, MFA event reference, authentication no older than
ten minutes, external secret-store reference, correlation ID and exact phrase
`VALIDATE MANAGED STAGING GOVERNANCE`. Values that grant access stay outside argv, Git and evidence.
There is no production fallback, schedule or universal recovery credential.

The stable command surface is:

```text
npm run governance -- preflight
npm run governance -- staging bootstrap dry-run
npm run governance -- staging bootstrap execute
npm run governance -- ceremony support|approval|knowledge|recovery
npm run governance -- validate notifications|invalidation
npm run governance -- evidence verify
npm run governance -- sign-off create|verify
npm run governance -- dependency report
```

Manifest and evidence paths are supplied through environment variables. Commands emit JSON and
exit non-zero on invalid environment, unsafe evidence, incomplete provider receipts, stale content,
expired risk acceptance or any failed gate.

## Managed sequence

1. Open an approved change and identify operator/reviewer/synthetic targets.
2. Inject staging-only values from the external secret store and run preflight.
3. Preserve the write-once evidence envelope and have the reviewer verify its SHA.
4. Execute only the approved ceremony. Bootstrap additionally requires its own exact phrase and
   independently created 15-minute authorization.
5. Collect audit IDs, provider delivery receipts and bounded invalidation observations without
   tenant content.
6. Run the validation commands, complete manual accessibility checks, then create sign-off.
7. Remove injected access, terminate support, archive synthetic knowledge and verify no stale read.

Do not mark managed staging complete until every row above is passing and the independent sign-off
exists. This document does not authorize a production operation.

## Human accessibility and UX record

The reviewer records environment, commit, browser/device, assistive technology/version, locale,
timestamp and sanitized artifact references for keyboard order, visible focus, modal containment
and Escape, support indicator, approval/inbox/expiry states, knowledge publish/archive, responsive
desktop/tablet/mobile, safe errors and timeout recovery. Each item is `PASS/FAIL/BLOCKED` with a
deviation reference. Axe/browser automation is attached as supporting evidence only; it cannot set
this human gate to passed.

See [sign-off](./GOVERNANCE_SIGNOFF.md), [notifications](./NOTIFICATION_VALIDATION.md),
[invalidation](./CACHE_INDEX_INVALIDATION.md) and the
[managed runbook](./runbooks/managed-staging-governance.md).
