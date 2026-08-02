# Governance operational validation

TASK-014 adds the executable managed boundary described in
[Managed staging validation](./MANAGED_STAGING_VALIDATION.md). Repository and CI simulations pass
independently of managed staging; real delivery, article cache/search/RAG invalidation, human UX and
reviewer sign-off remain external `PENDING/BLOCKED` gates and cannot be inferred from automation.

## Gap matrix

| Ceremony              | Prerequisites / environment                                                   | Actors and permission                    | Expected audit / notification                              | Rollback                                                | Evidence                                           | Current gap                                    |
| --------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| First owner           | migrated DB, staging allowlist, recent TOTP session, single-use authorization | controlled operator + exact target       | bootstrap audit + target security notification             | transaction rollback; no automatic last-owner removal   | dry-run/execute JSON, ledger IDs, invariant bundle | managed staging execution `PENDING`            |
| Support session       | active PLATFORM_SUPPORT/ADMIN, target org, reason/ticket, MFA/recent auth     | support actor; exact support scope       | start/end/termination audit + org OWNER/ADMIN notification | terminate immediately; expiry denies                    | session/audit/notification IDs                     | manual support indicator review `PENDING`      |
| Controlled approval   | connected executor and current resource version                               | requester + distinct authorized approver | request/decision/execution audit and scoped notifications  | reject/cancel/expire or new request; never edit payload | approval/fingerprint/version/event IDs             | managed four-action drill `PENDING`            |
| Knowledge publication | synthetic reviewed org article                                                | org reviewer/publisher + second approver | approval/execution audit + security notification           | archive or return PRIVATE; retain approval evidence     | article version, approval and visibility           | managed RAG/index invalidation drill `PENDING` |
| Evidence export       | explicit safe directory, commit SHA                                           | operator; reviewer later                 | no production write                                        | delete/reissue only under evidence retention policy     | schema v1 JSON/hash                                | reviewer sign-off `PENDING`                    |

## Execution modes

- Repository tests use isolated fixtures and never obtain staging credentials.
- Simulated ceremony runs integration/browser tests against synthetic local data.
- Managed staging requires explicit operator invocation and secrets supplied outside GitHub/repo.
- Production ceremony is not implemented or authorized by TASK-013.
- TASK-014 managed commands require manual staging binding, recent MFA, external secrets and an
  exact phrase; production and CI sign-off are denied.

CI runs unit/integration/browser, migration rehearsal, build, documentation and static scans. It
must not run `governance:bootstrap:execute` or claim managed staging evidence.

## Manual validation checklist

All items remain `PENDING` until a person records date, environment, artifact and reviewer:

- [ ] keyboard navigation
- [ ] screen reader
- [ ] focus management
- [ ] mobile/tablet layout
- [ ] active support indicator visibility
- [ ] approval inbox clarity
- [ ] safe error messages
- [ ] audit readability
- [ ] notification clarity
- [ ] localization
- [ ] timeout/expiry UX

## Invariants

`governance:invariants` blocks on missing active owner, duplicate/invalid bootstrap ledger,
disabled-user ownership grants, malformed reusable executions, self approval, organization PUBLIC
without executed approval, and persisted registry-only actions. Support expiry is reported and is
denied by the permission evaluator. Tenant RAG isolation, replay denial and last-owner protection
are additionally exercised by integration/browser and static policy tests.

Evidence integrity, notification and invalidation validation are specified in
[Governance evidence](./GOVERNANCE_EVIDENCE.md),
[Notification validation](./NOTIFICATION_VALIDATION.md) and
[Cache/index invalidation](./CACHE_INDEX_INVALIDATION.md).
