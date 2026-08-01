# Unified Client Portal Architecture

## Decision

`/portal` is the canonical namespace for the authenticated client cabinet. Public authentication
pages remain under `/portal/login`, `/portal/forgot-password`, and `/portal/reset-password`.
Administrative workflows remain under `/admin`.

Legacy `/dashboard` URLs are compatibility entry points. They must preserve query strings and deep
links while redirecting to an equivalent `/portal` or `/admin` destination. They must not introduce
redirect loops or a second navigation model.

## Function and route mapping

| Function                 | Current route                              | Portal implementation | Dashboard implementation               | Chosen route             | Transfer                                      | Compatibility                              | Must not be deleted                      |
| ------------------------ | ------------------------------------------ | --------------------- | -------------------------------------- | ------------------------ | --------------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| Client overview          | `/portal`, `/dashboard`                    | Request overview      | Experimental overview                  | `/portal`                | Consolidate metrics and quick actions         | `/dashboard` redirects with query          | Request summary                          |
| Request list             | Portal home                                | Embedded list         | `/dashboard/support` link              | `/portal/requests`       | Extract complete list                         | Dashboard support redirects                | Tenant filtering                         |
| Request details          | `/portal/requests/[id]`                    | Complete              | None                                   | `/portal/requests/[id]`  | Keep                                          | Preserve deep link                         | Messages, attachments, audit             |
| Create request           | `/portal/requests/new`                     | Complete              | None                                   | `/portal/requests/new`   | Keep                                          | N/A                                        | Jira boundary and server tenant          |
| Client documents         | None                                       | None                  | Placeholder                            | `/portal/documents`      | Add tenant read view                          | `/dashboard/documents` redirects           | Status, OCR/review/index state           |
| Document details         | None                                       | None                  | `/dashboard/knowledge/[id]` ADMIN-only | `/portal/documents/[id]` | Add safe client view                          | Knowledge deep link redirects              | Preview, citation, download              |
| Knowledge search         | Public `/knowledge`                        | None                  | `/dashboard/knowledge` ADMIN-only      | `/portal/knowledge`      | Add tenant search/RAG UI                      | `/dashboard/knowledge` role-aware redirect | Citations and no-answer behavior         |
| Document administration  | Dashboard Knowledge Center                 | None                  | Upload/delete/reprocess                | `/admin/documents`       | Move unchanged admin tools                    | ADMIN dashboard link redirects             | Upload/delete/reprocess/reindex          |
| Company profile          | `/portal/profile`                          | User and company form | None                                   | `/portal/company`        | Split canonical company page                  | `/portal/profile` redirects                | Existing profile data                    |
| Team                     | `/portal/team`                             | List and invite       | None                                   | `/portal/team`           | Keep and secure invite                        | N/A                                        | Existing CLIENT/ADMIN roles              |
| Notification center      | None                                       | Preferences only      | None                                   | `/portal/notifications`  | Add center and retain preferences in settings | N/A                                        | Email preferences                        |
| Settings                 | `/portal/profile`, `/portal/notifications` | Distributed           | Dashboard placeholder                  | `/portal/settings`       | Consolidate personal preferences              | `/dashboard/settings` redirects            | Profile and notification settings        |
| AI assistant             | Public `/assistant`, dashboard placeholder | None                  | Placeholder                            | `/portal/knowledge`      | Tenant RAG only; no new public chat           | `/dashboard/ai` redirects                  | Rate, budget, citations, prompt controls |
| Projects                 | Dashboard placeholder                      | None                  | Placeholder                            | `/portal/requests`       | No new domain is invented                     | `/dashboard/projects` redirects            | Placeholder is documented only           |
| Admin requests           | `/admin/requests`                          | N/A                   | N/A                                    | `/admin/requests`        | Keep separate                                 | None                                       | Admin status and export                  |
| Admin knowledge articles | `/admin/knowledge`                         | N/A                   | N/A                                    | `/admin/knowledge`       | Keep separate                                 | None                                       | Publishing workflow                      |

## Security boundary

- Every protected portal render resolves an opaque server-side session and confirms that the user
  is active and still has the server-selected organization membership.
- Session validation applies inactivity/absolute expiry and revocation. Cookie payload contains no
  user or tenant data.
- Tenant identifiers are derived from the validated server session. Client requests containing
  `companyId` are rejected.
- Client document reads are scoped by the compound `(companyId, id)` identity. Upload, reprocess,
  manage and destructive delete are separate organization permissions; delete additionally uses
  server-side critical-action confirmation.
- Cross-tenant resources use the same not-found response as missing resources.
- Safe redirects accept application-local paths only and preserve query strings.
- Portal audit accepts only fixed action/target pairs for portal access, document download,
  company update, team invite, and notification read. Tenant and actor are derived only from the
  validated server session. Events contain action, target type, safe target ID, outcome,
  correlation ID, and, for downloads only, byte size.
- Portal audit never stores URLs, query parameters, user-derived pathnames, emails, names,
  invitations, filenames, document/request/message/search content, prompts, answers, excerpts,
  provider/model details, credentials, or raw errors. A temporary audit sink failure is fail-open
  and exposes no sink detail to the client.
- Existing request/document mutation audit and RAG telemetry remain their authoritative event
  sources and are not duplicated by the portal helper.
- `/portal/settings/security` manages TOTP, one-time recovery codes, password and minimized active
  sessions. Identity mutations reject client tenant identifiers; password/MFA reset revokes
  sessions. Identity security telemetry contains only allowlisted method/reason/session metadata.
- The same page shows configured enterprise identity providers and linked identity status; it never
  exposes secret references, claims or provider tokens. Only a server-validated OIDC callback may
  link an identity, and matching email is explicitly insufficient.
- Tenant ADMIN provider lifecycle lives at
  `/portal/settings/security/identity-providers`, `/new` and `/[id]`. The UI receives only safe
  projections, treats the client-secret reference as write-only and cannot self-declare a real
  tenant validated. Provider and SSO policy mutations derive company from the validated server
  session and reject client tenant identifiers.
- Team invite creates a tenant-bound pending invitation, not a user or membership. An allowlisted
  organization role no higher than the inviter may appear only after an authenticated verified
  identity atomically accepts the one-time code; invitation never grants OWNER.

## Compatibility lifecycle

Dashboard compatibility routes are deprecated in TASK-007 but remain supported. Removal requires a
separate decision, usage evidence, a communicated sunset date, and dedicated migration work.

## Organization permission model

TASK-011 строит desktop/mobile navigation на сервере из validated organization membership, а не
из client storage или hardcoded role. Every destination repeats its permission check on render or
API. Team shows role/status and only permitted invitation, delegation, suspension and removal
controls. Company fields require `organization.update`; personal profile fields remain self-service.
Requests, documents, notifications, knowledge search, providers, policy and audit map to the fixed
matrix in [Authorization Architecture](./AUTHORIZATION_ARCHITECTURE.md).

Global platform administration remains visually and logically separate. Before TASK-012 legacy
knowledge articles had no tenant owner and could not be reclassified safely by a UI check.

TASK-012 completes the deferred ownership migration and adds protected `/portal/platform`,
`/roles`, `/audit`, `/support`, `/approvals` and `/operations` routes. Platform navigation is
emitted only from a fresh active assignment. Organization knowledge details use
`/portal/knowledge/[slug]`; public `/knowledge/[slug]` cannot render organization-only material.

## Browser verification boundary

TASK-008 проверяет portal architecture отдельным Playwright/Chromium gate. Test topology:

- guarded loopback PostgreSQL database `avantime_browser_integration`;
- deterministic fixtures двух companies, двух `CLIENT` и отдельного `ADMIN`;
- обычная `/portal/login` DB authentication и повторная portal membership validation;
- source-scoped local credential, legacy PBKDF2 rehash и opaque PostgreSQL session;
- desktop portal smoke, `/dashboard/**` redirects и direct cross-tenant URLs;
- tablet/mobile overflow и accessible navigation dialog;
- axe WCAG A/AA blocking для `critical` и `serious`.

Fixtures не вводят роль `USER`: в текущей принятой модели user fixture использует роль `CLIENT`.
Browser preparation не меняет production tenant model, не принимает client `companyId` и не
вызывает AI/email/Jira/storage providers. Полный operational contract и artifact policy описаны в
[Browser Testing](./BROWSER_TESTING.md).
