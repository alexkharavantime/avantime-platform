# TASK-012 — Platform permissions, knowledge ownership and controlled approvals

**Статус:** In Progress  
**Рабочая ветка:** `feature/task-012-platform-governance`  
**Дата начала:** 2026-08-01

## Цель и границы

TASK-012 отделяет global platform authorization от organization membership, классифицирует
knowledge articles по owner scope и visibility и добавляет controlled approval foundation для
особо критических действий. Authentication, OIDC protocol, OCR, retrieval ranking, Jira и Agent+
business logic не изменяются. TASK-006 и Draft PR #11 не входят в scope.

## Gap matrix

| Resource/action                         | Scope                                   | Проверка до TASK-012               | Ownership                                | Risk                                                   | Required permission                                                        | Migration / compatibility                                                              | Approval                                         |
| --------------------------------------- | --------------------------------------- | ---------------------------------- | ---------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Platform navigation/admin shell         | Platform                                | global `User.role=ADMIN`           | Global                                   | Organization/platform conflation                       | `platform.view`                                                            | Legacy ADMIN не получает grant; нужен explicit bootstrap/assignment                    | Нет                                              |
| Platform role lifecycle                 | Platform                                | Отсутствовал                       | User assignment                          | Неограниченный global access                           | `platform.roles.manage`                                                    | Новая independent assignment table                                                     | PLATFORM_OWNER assign/remove                     |
| System events/configuration             | Platform                                | Inline ADMIN                       | Global                                   | Organization ADMIN мог восприниматься как system admin | `platform.audit.view`, `platform.configure`                                | Routes переводятся поэтапно; новые routes не используют adapter                        | Export — да                                      |
| Operational documents/jobs/health       | Platform                                | Legacy ADMIN или document helper   | Tenant resource under platform operation | Cross-tenant access                                    | `platform.documents.operations`, `platform.jobs.*`, `platform.health.view` | Existing processing algorithm unchanged                                                | Destructive support action — да                  |
| Cross-tenant support                    | Platform + explicit organization target | Silent global ADMIN access         | Server-selected company                  | Bulk tenant disclosure/impersonation                   | `platform.support.*`                                                       | Short-lived support session, no membership creation                                    | Sensitive/destructive — да                       |
| Organization settings/members/providers | Organization                            | Central TASK-011 permissions       | Explicit company                         | Platform role escalation into tenant                   | Existing `organization.*`, `members.*`, `identity.*`                       | No platform fallback                                                                   | Last OWNER/SSO/provider destructive actions — да |
| KnowledgeArticle                        | Platform or organization                | No company/owner; status only      | Missing                                  | Public/cross-tenant disclosure                         | `knowledge.*` or `platform.knowledge.*`                                    | Deterministic platform backfill; immutable owner; unclassified quarantined             | Organization → PUBLIC — да                       |
| Tenant document/RAG chunks              | Organization                            | Compound company key               | Explicit company                         | Foreign retrieval/citation                             | `knowledge.search`, `documents.view`                                       | Retrieval algorithm unchanged                                                          | Нет                                              |
| Public knowledge                        | Public visibility policy                | `PUBLISHED` only                   | Implicit platform                        | Draft/private publication                              | `platform.knowledge.publish` + visibility permission                       | Legacy rows become PRIVATE pending explicit review                                     | Tenant content → PUBLIC — да                     |
| Request export                          | Organization                            | Global ADMIN exported every tenant | Mixed                                    | Bulk tenant exfiltration                               | `requests.export`                                                          | Route is now session-tenant scoped                                                     | Bulk tenant export uses approval foundation      |
| Audit export                            | Platform or organization                | Confirmation phrase only           | Scope-dependent                          | Sensitive evidence disclosure                          | `platform.audit.export` / `organization.export`                            | Dedicated action types                                                                 | Да                                               |
| Critical confirmations                  | Both                                    | MFA + recent auth + phrase         | Scope-dependent                          | Same actor could request and execute                   | Action registry only                                                       | Existing confirmation remains for non-two-person actions                               | Selected actions require separate approver       |
| Legacy role adapter                     | Compatibility                           | `authorizeApi(['ADMIN'])`          | Mixed                                    | New role debt                                          | Central services                                                           | Removed from all API routes; isolated helper remains for bounded legacy pages/sessions | N/A                                              |

## Реализованный repository scope

- independent `PlatformRoleAssignment` with five fixed roles and no organization side effect;
- fixed platform permission allowlist and deny-by-default central evaluator;
- short-lived support sessions with MFA, recent auth, reason, ticket, exact scopes, expiry,
  termination, audit and organization notification;
- explicit knowledge owner scope, visibility, REVIEW state, immutable organization owner,
  quarantine marker, version fencing and classification evidence;
- public/organization/platform knowledge reads use separate server-side audience filters;
- governance approval policy registry, canonical SHA-256 fingerprint, requester/approver
  separation, TTL, cancellation, rejection, expiry, single execution and replay protection;
- dedicated PLATFORM_OWNER, scoped audit export, organization knowledge PUBLIC and versioned
  support-request status executors;
- protected `/portal/platform/**` routes for roles, audit, support, approvals and operations;
- permission scan blocks new API imports of the legacy role adapter.

The remaining compatibility boundary is limited to legacy page redirects, login landing
projection, old session fields and membership write-through needed by staged deployments. It may
not authorize new API operations. Target removal is the Version 2.0 compatibility-cleanup
milestone after deployed sessions/rows and `/dashboard/**` usage are verified.

The remaining registry actions (last organization OWNER transfer, required-SSO emergency disable,
break-glass disable, identity-provider delete and bulk tenant export) are policy definitions only.
The generic request API rejects them until a server-side resource resolver and dedicated executor
exist; this is intentionally fail-closed and avoids recording approvals that cannot authorize a
real action.

## Migration strategy

Migration `20260801120000_platform_governance` is additive:

1. creates new enums/tables and nullable knowledge ownership columns;
2. classifies current legacy articles deterministically as platform-owned;
3. preserves lifecycle/content but sets every unclassified legacy row to `PRIVATE` pending review;
4. records `task-012-existing-platform-article-v1` evidence;
5. adds constraints and immutable-owner trigger only after backfill;
6. deliberately creates no platform assignment from ambiguous legacy `User.role=ADMIN`;
7. retains `User.role`, membership compatibility columns and all original content.

The current schema has enough provenance to classify every existing `KnowledgeArticle` as the
legacy platform collection. Imports without that provenance must use `LEGACY_UNCLASSIFIED` with
`quarantinedAt` and are excluded from reads. Client-provided company identifiers never classify
ownership.

Rollback after new assignments, ownership or approvals are written is restore/forward-fix only.
Dropping the new columns/tables would lose governance evidence and is not an accepted down
migration. Repeated deploy is idempotent through Prisma migration history.

The first platform owner is an operational bootstrap, not a role inference: two authorized
operators verify the target identity and MFA evidence, insert one `PLATFORM_OWNER` assignment in a
controlled maintenance window, record the ticket and database evidence, revoke the target's
sessions and immediately validate the normal approval workflow. A legacy `ADMIN`, organization
`OWNER` or OIDC claim is never eligible automatically.

## Acceptance status

- [x] Platform and organization role models are independent.
- [x] Unknown/disabled platform role or permission denies by default.
- [x] Support session is explicit, scoped, expiring and audited.
- [x] Knowledge ownership and visibility are explicit and tenant-safe.
- [x] Legacy knowledge backfill is deterministic and evidence-bearing.
- [x] Approval registry/fingerprint/executor foundation is implemented.
- [x] PLATFORM_OWNER and tenant PUBLIC escalation use dedicated executors.
- [x] Legacy adapter has no API route usages and new usages are scan-blocked.
- [x] Full unit/integration/browser/security/build gates recorded.
- [ ] Manual governance, screen-reader and staging migration review completed.

## Связанные документы

- [Platform Governance](../PLATFORM_GOVERNANCE.md)
- [Knowledge Governance](../KNOWLEDGE_GOVERNANCE.md)
- [Authorization Architecture](../AUTHORIZATION_ARCHITECTURE.md)
- [ADR-0029](../DECISIONS.md#adr-0029)
- [TASK-011](./TASK-011.md)
