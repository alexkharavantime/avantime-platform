# Organization authorization architecture

TASK-011 separates tenant-bound organization authorization from legacy identity projection, and
TASK-012 moves platform authorization to independent assignments. Global `User.role` remains only
a bounded compatibility field; it authorizes neither new platform routes nor tenant resources.
Organization access is decided from a fresh, active `OrganizationMembership` and a fixed system
role.

## System roles

| Role      | Purpose                                                                    |
| --------- | -------------------------------------------------------------------------- |
| `OWNER`   | Organization governance, security policy, providers, exports and members   |
| `ADMIN`   | Organization administration except assigning `OWNER` without explicit flow |
| `MANAGER` | Operational requests, documents, knowledge and lower-role team management  |
| `MEMBER`  | Normal request creation/comments and organization knowledge/document reads |
| `VIEWER`  | Read-only organization portal access                                       |

`OWNER` is never inferred from legacy `ADMIN`, email, OIDC claims or group mapping. Arbitrary
custom roles and a permission editor are intentionally outside this phase.

## Permission vocabulary and matrix

The complete allowlist is defined in `apps/web/lib/organization-permissions.ts`. An unknown name
or role is denied.

| Domain        | Permissions                                                                                           | OWNER | ADMIN | MANAGER                               | MEMBER              | VIEWER           |
| ------------- | ----------------------------------------------------------------------------------------------------- | ----- | ----- | ------------------------------------- | ------------------- | ---------------- |
| Organization  | `organization.view`, `update`, `security.manage`, `audit.view`, `export`                              | all   | all   | view                                  | view                | view             |
| Members       | `members.view`, `invite`, `role.manage`, `remove`                                                     | all   | all   | all, constrained by delegation policy | view                | none             |
| Requests      | `requests.view`, `create`, `comment`, `manage`, `export`                                              | all   | all   | view/create/comment/manage            | view/create/comment | view             |
| Documents     | `documents.view`, `download`, `upload`, `manage`, `reprocess`, `delete`, `export`                     | all   | all   | view/download/upload/manage/reprocess | view/download       | view/download    |
| Knowledge     | `knowledge.view`, `search`, `manage`, `publish`                                                       | all   | all   | all                                   | view/search         | view/search      |
| Notifications | `notifications.view`, `manage`                                                                        | all   | all   | all                                   | all                 | view             |
| Identity      | `identity.sessions.manage_self`, `mfa.manage_self`, `providers.manage`, `policy.manage`, `audit.view` | all   | all   | self session/MFA                      | self session/MFA    | self session/MFA |

Role assignment is a second, mandatory check. `MANAGER` may assign only `MEMBER` or `VIEWER`;
`ADMIN` cannot assign `OWNER`; self-escalation is denied; role input is allowlisted. A role or
status mutation uses an optimistic membership version, serializes OWNER lifecycle changes on the
organization row, and revokes the target's active organization sessions.

## Resolution contract

The central service receives a validated session, a permission, and optional server-loaded
resource context. Tenant and actor always come from the server session. The decision contains an
allow/deny result, a safe internal reason code and safe audit target context; it is never returned
as the client policy model.

Resolution is deny-by-default when the session, organization, active membership, known role or
known permission is absent. A resource with a different tenant is denied and routes may reduce
that result to a safe 404. Client-side navigation and hidden controls are only UX; every changed
route repeats authorization server-side.

Session resolution reloads the user and membership, including `active`, `status`, role and
membership version. Disabled users, suspended/removed memberships and stale role-version sessions
therefore stop authorizing. No permission cache was added; PostgreSQL remains the source of truth.

## Compatibility and migration

The additive migration preserves `OrganizationMembership.role` and `active` while adding
`organizationRole`, `status`, `version`, suspension/removal timestamps and invitation role.
Existing `ADMIN` membership maps to organization `ADMIN`; existing `CLIENT` maps to `MEMBER`.
Inactive legacy membership maps to `SUSPENDED`. It does not create an `OWNER`.

For a bounded migration period, a session missing the new fields maps global `ADMIN` to
organization `ADMIN` and `CLIENT` to `MEMBER` only when it has an organization. Compatibility use
emits a development/test warning and an allowlisted audit event. New and changed routes use the
central permission service. The compatibility adapter may be removed only after deployed rows,
sessions and callers are confirmed migrated.

The first `OWNER` can be bootstrapped only when no active owner exists, by the organization member
who is both legacy platform `ADMIN` and organization `ADMIN`, with MFA, recent authentication,
exact `ASSIGN OWNER` confirmation, membership version and organization-level transaction lock.
Normal assignment thereafter is OWNER-only and uses the same step-up controls. The last active
OWNER cannot be demoted, suspended or removed.

## Critical governance

The critical-action registry covers owner assignment/removal, required SSO, break-glass disable,
provider delete, organization/audit export, bulk member removal and destructive document delete.
An implemented critical operation must pass recent authentication (ten minutes), MFA and its exact
confirmation phrase on the server. Success/denial is audited and success produces a generic
security notification. The registry is also the foundation for future two-person approval; no
fake approval workflow is claimed.

## Audit and notifications

Organization audit actions are fixed: authorization denial, role/status/owner changes,
compatibility use, export request and critical confirmation. Repeated deny events are bounded per
actor and permission. Metadata accepts only permission/reason, role/status/version and critical
action identifiers. It cannot contain email, names, content, URLs/query, tokens, claims, secrets or
raw errors.

Security notifications use seven fixed generic templates for role, owner, suspension, removal,
required SSO, critical permission use and export. They contain no other member's identity or
operation payload. The established user-operation policy remains fail-open for a temporary audit
or notification sink failure.

## Resource boundaries and limitations

- Requests are organization-wide in the client portal; every list/detail/message/attachment query
  is tenant-scoped. Creator/participant ACL is not added in this phase.
- Documents use organization ownership. Read/download, upload/reprocess and destructive delete are
  separate permissions; delete has server-side step-up confirmation.
- Portal knowledge view/search follows organization permissions and tenant document retrieval;
  article owner scope, visibility and quarantine are now explicit server-side filters.
- Notifications remain user-owned inside the organization; mark-as-read filters both user and
  tenant.
- A bounded set of legacy pages still uses compatibility redirects/checks, but no API route may
  import the legacy role adapter; new platform operations use `PlatformRoleAssignment`.
- Organization deletion, arbitrary custom roles, per-document ACL and two-person approval are not
  implemented.

## TASK-012 platform separation

Active `PlatformRoleAssignment` records use five fixed roles and an independent allowlist;
organization OWNER does not imply platform access, and a platform assignment never creates
membership. Cross-tenant access requires a short-lived support session for one server-resolved
organization.

Knowledge articles now have immutable owner scope, explicit visibility and quarantine. Selected
critical operations cross a persisted two-person approval executor; confirmation UI alone is not
execution authorization. See [ADR-0029](./DECISIONS.md#adr-0029).

## Related documents

- [Portal Architecture](./PORTAL_ARCHITECTURE.md)
- [Identity Architecture](./IDENTITY_ARCHITECTURE.md)
- [Security Hardening](./SECURITY_HARDENING.md)
- [Testing](./TESTING.md)
- [TASK-011](./tasks/TASK-011.md)
- [Platform Governance](./PLATFORM_GOVERNANCE.md)
- [Knowledge Governance](./KNOWLEDGE_GOVERNANCE.md)
- [TASK-012](./tasks/TASK-012.md)
- [ADR-0028](./DECISIONS.md#adr-0028)
