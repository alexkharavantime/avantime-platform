# TASK-011 — Organization permission model and governance

**Статус:** Done  
**Рабочая ветка:** `feature/task-011-organization-permissions`  
**Дата начала:** 2026-07-31

## Цель и границы

TASK-011 заменяет разрозненную tenant authorization единым deny-by-default permission service,
добавляет system organization roles, безопасный membership/OWNER lifecycle, permission-aware UI,
audit и notifications. Global platform operations сохраняют отдельную legacy role boundary.
TASK-006, Jira, OCR, RAG и arbitrary custom roles не входят в scope.

## Gap matrix исходной модели

| Resource/action           | До TASK-011                                     | Server/UI/tenant состояние                | Риск                                       | Решение TASK-011                                       | Compatibility / external dependency                   |
| ------------------------- | ----------------------------------------------- | ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------- |
| Portal session            | active membership + global `CLIENT/ADMIN`       | server-side, tenant в session             | role не отражала обязанности в компании    | fresh membership role/status/version                   | legacy mapping до завершения rollout                  |
| Navigation                | hardcoded links + отдельные role checks         | client visibility, deep links неоднородны | privileged items/несогласованные redirects | server-built permission menu + deep-link checks        | `/dashboard/**` redirects сохранены                   |
| Company profile           | любой member менял company                      | tenant server-side                        | MEMBER меняет organization data            | `organization.update`                                  | personal fields доступны обычному member              |
| Team/invitations          | любой member мог invite; global role grant      | tenant partly server-side                 | escalation/reactivation                    | role/status/version/delegation and session revocation  | legacy invitation role retained                       |
| Requests                  | portal ADMIN видел все tenants                  | queries partly depended on global role    | cross-tenant disclosure                    | organization-scoped permissions and queries            | legacy global admin routes remain platform operations |
| Documents                 | one ADMIN-vs-CLIENT helper                      | tenant repository existed                 | upload/reprocess/delete conflated          | separate read/download/upload/reprocess/delete         | document processing/RAG unchanged                     |
| Knowledge                 | client document RAG + global article admin      | tenant RAG; articles have no tenant owner | false tenant authorization for articles    | portal view/search permission; legacy admin documented | tenant-owned article migration needs separate ADR     |
| Notifications             | user/tenant filters, scattered access checks    | server-side                               | mutation consistency                       | view/manage permissions; same user+tenant update       | delivery semantics unchanged                          |
| Identity providers/policy | inline global ADMIN                             | tenant-bound services                     | platform/org role conflation               | provider/policy permissions in route and service       | real provider ceremony remains external               |
| Audit/export              | identity/portal audit helpers                   | tenant safe metadata                      | no governance actions/rate-limited denies  | organization allowlist, deny bound, critical export    | audit sink remains fail-open by accepted policy       |
| Platform admin operations | `authorizeApi(['ADMIN'])` / inline global ADMIN | server-side, mostly non-tenant models     | migration debt                             | preserved as explicit compatibility boundary           | later platform-role consolidation                     |

## Реализованная модель

- immutable system roles: `OWNER`, `ADMIN`, `MANAGER`, `MEMBER`, `VIEWER`;
- fixed permission vocabulary in `organization-permissions.ts`;
- central session/API authorization and optional resource tenant/owner context;
- unknown role/permission, missing organization and inactive membership deny by default;
- additive nullable-first migration: `ADMIN → ADMIN`, `CLIENT → MEMBER`, no automatic OWNER;
- first OWNER explicit bootstrap; last OWNER protected with organization transaction lock;
- allowlisted invitations and role delegation; SSO mapping can never grant OWNER;
- lifecycle `ACTIVE/INVITED/SUSPENDED/REMOVED`, version fencing and session revocation;
- no permission cache; fresh PostgreSQL membership remains authoritative;
- server-built desktop/mobile navigation and server deep-link enforcement;
- organization audit and generic security notifications;
- blocking permission static scan added to CI.

## Critical action policy

The registry includes owner assignment/removal, required SSO, break-glass disable, provider delete,
organization/audit export, bulk removal and destructive document delete. Implemented paths require
MFA, authentication not older than ten minutes and an exact server-checked phrase. Registry entries
without a product operation are a policy foundation, not a claim that the operation exists.

## Tests and evidence

Added unit coverage for role permissions, deny-by-default, inactive membership, cross-tenant
resources, delegation, last OWNER, self-escalation, SSO role limits, step-up, audit redaction,
notification templates, compatibility and navigation. PostgreSQL integration covers OWNER/ADMIN/
MANAGER delegation, MEMBER/VIEWER decisions, membership version/session invalidation, suspension,
removal/OIDC denial, provider/audit denial and first-owner bootstrap. Playwright coverage includes
role navigation, deep links, team changes/escalation, last OWNER, suspension/reactivation,
document/security visibility, mobile navigation and axe.

Фактически подтверждено 2026-07-31:

- Prisma generation и production build с CI test-only environment — успешно; Next.js собрал 91
  static entry;
- clean typecheck — 4/4 workspace packages; lint — 4/4 (database/shared/ui сохраняют свои
  documented placeholder lint commands);
- полный unit/security suite — 147/147; permission suite — 9/9; identity suite — 21/21;
- PostgreSQL/MinIO/local queue и authorization integration — 22/22;
- full browser/responsive/accessibility suite — 60/60;
- migration rehearsal — empty, legacy upgrade и repeated deploy verified;
- permission, identity, client-tenant, secret, forbidden-credential, default-secret и migration
  scans — passed без findings;
- documentation link check — 17 документов; scoped Prettier и `git diff --check` — passed.

Manual role-governance и assistive-technology review не выполнялись и не считаются пройденными.

## Ограничения

- Legacy platform-wide article/request/system administration retains global `User.role` until its
  models become tenant-owned or a separate platform permission model is approved.
- No arbitrary custom roles, per-document ACL, organization deletion or two-person approval UI.
- No real OIDC tenant validation is claimed by TASK-011.
- Rollback after application starts writing new role/status/version values is forward-fix/restore;
  legacy columns are retained to make staged deployment safe.

## Результат выполнения

Repository-level scope завершён: central permission service, migration, OWNER governance,
permission-aware portal/API, audit/notifications, CI gates, tests и документация реализованы и
проверены. Это не означает production readiness всего продукта; external staging governance,
manual role review и assistive-technology review остаются отдельными rollout gates.

## Связанные документы

- [Authorization Architecture](../AUTHORIZATION_ARCHITECTURE.md)
- [Portal Architecture](../PORTAL_ARCHITECTURE.md)
- [Identity Architecture](../IDENTITY_ARCHITECTURE.md)
- [Security Hardening](../SECURITY_HARDENING.md)
- [Testing](../TESTING.md)
- [Browser Testing](../BROWSER_TESTING.md)
- [Decisions](../DECISIONS.md#adr-0028)
